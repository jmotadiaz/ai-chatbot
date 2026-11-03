/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentResponse } from "@/components/code/agent-response";
import { isResponseComment } from "@/components/code/file-browser/types";
import {
  FileBrowserProvider,
  useFileBrowser,
} from "@/components/code/file-browser/file-browser-provider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

class InertIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

const ConnectedResponse: React.FC<{ content: string }> = ({ content }) => {
  const { state } = useFileBrowser();
  const responseComments = state.pendingComments.filter(isResponseComment);
  return (
    <AgentResponse
      messageId="a-1"
      turnNumber={2}
      responseComments={responseComments}
    >
      {content}
    </AgentResponse>
  );
};

const CommentsProbe: React.FC = () => {
  const { state } = useFileBrowser();
  return (
    <output data-testid="comments">
      {JSON.stringify(state.pendingComments)}
    </output>
  );
};

function renderResponse(content: string) {
  vi.stubGlobal("IntersectionObserver", InertIntersectionObserver);
  return render(
    <FileBrowserProvider project="proj" sessionId="s1">
      <ConnectedResponse content={content} />
      <CommentsProbe />
    </FileBrowserProvider>,
  );
}

async function writeComment(
  view: ReturnType<typeof renderResponse>,
  text: string,
) {
  const textarea = await waitFor(() =>
    view.getByPlaceholderText("Leave a comment…"),
  );
  fireEvent.change(textarea, { target: { value: text } });
  fireEvent.click(view.getByRole("button", { name: "Comment" }));
}

function storedComments(view: ReturnType<typeof renderResponse>) {
  return JSON.parse(view.getByTestId("comments").textContent ?? "[]") as Array<
    Record<string, unknown>
  >;
}

describe("AgentResponse response comments", () => {
  it("stores a response anchor with the full prose block snapshot", async () => {
    const view = renderResponse("# Result\n\nSecond line");

    fireEvent.click(
      await waitFor(() =>
        view.getByRole("button", {
          name: "Comment on Markdown block starting at line 1",
        }),
      ),
    );
    await writeComment(view, "retitle this");

    await waitFor(() => {
      expect(storedComments(view)).toEqual([
        expect.objectContaining({
          kind: "response",
          messageId: "a-1",
          turnNumber: 2,
          startLine: 1,
          endLine: 1,
          lineText: "# Result",
          text: "retitle this",
        }),
      ]);
    });
  });

  it("comments an exact code line while preserving the copy control", async () => {
    const view = renderResponse("Before\n\n```ts\nconst x = 1;\n```");

    const copy = await waitFor(() => view.getByTitle("Copy Code"));
    expect(copy).not.toBeNull();
    fireEvent.click(
      await waitFor(() =>
        view.getByRole("button", { name: "Comment on line 4" }),
      ),
    );
    await writeComment(view, "rename this");

    await waitFor(() => {
      expect(storedComments(view)).toEqual([
        expect.objectContaining({
          kind: "response",
          startLine: 4,
          endLine: 4,
          lineText: "const x = 1;",
          text: "rename this",
        }),
      ]);
    });
  });

  it("anchors a list item to its source line rather than the whole list", async () => {
    const view = renderResponse("- alpha\n- beta");

    fireEvent.click(
      await waitFor(() =>
        view.getByRole("listitem", { name: "Comment on line 2" }),
      ),
    );
    await writeComment(view, "drop beta");

    await waitFor(() => {
      expect(storedComments(view)).toEqual([
        expect.objectContaining({
          startLine: 2,
          endLine: 2,
          lineText: "- beta",
          text: "drop beta",
        }),
      ]);
    });
  });

  it("replaces the comment on the same anchor instead of creating duplicates", async () => {
    const view = renderResponse("# Title");

    fireEvent.click(
      await waitFor(() =>
        view.getByRole("button", {
          name: "Comment on Markdown block starting at line 1",
        }),
      ),
    );
    await writeComment(view, "first version");

    await waitFor(() => {
      expect(storedComments(view)).toHaveLength(1);
      expect(storedComments(view)[0]?.text).toBe("first version");
    });

    // Click again to edit the existing comment
    fireEvent.click(
      view.getByRole("button", {
        name: "Comment on Markdown block starting at line 1",
      }),
    );
    const textarea = await waitFor(() =>
      view.getByPlaceholderText("Leave a comment…"),
    );
    expect((textarea as HTMLTextAreaElement).value).toBe("first version");
    fireEvent.change(textarea, { target: { value: "updated version" } });
    fireEvent.click(view.getByRole("button", { name: "Update" }));

    await waitFor(() => {
      const comments = storedComments(view);
      expect(comments).toHaveLength(1);
      expect(comments[0]?.text).toBe("updated version");
    });
  });

  it("maintains accurate anchors across multiple sections without index drift", async () => {
    const markdown = [
      "### Alcance e interacción",
      "",
      "- Punto 1",
      "- Punto 2",
      "",
      "### Implementación y performance",
      "",
      "- Punto A",
      "",
      "### Veredicto",
      "",
      "Texto del veredicto final",
    ].join("\n");

    const view = renderResponse(markdown);

    // The heading "### Veredicto" starts at line 10
    const veredictoHeading = await waitFor(() =>
      view.getByRole("button", {
        name: "Comment on Markdown block starting at line 10",
      }),
    );
    expect(veredictoHeading).toBeDefined();
    fireEvent.click(veredictoHeading);
    await writeComment(view, "comentario en veredicto");

    await waitFor(() => {
      expect(storedComments(view)).toEqual([
        expect.objectContaining({
          kind: "response",
          startLine: 10,
          endLine: 10,
          lineText: "### Veredicto",
          text: "comentario en veredicto",
        }),
      ]);
    });

    // And the subsequent paragraph "Texto del veredicto final" at line 12
    const veredictoText = await waitFor(() =>
      view.getByRole("button", {
        name: "Comment on Markdown block starting at line 12",
      }),
    );
    expect(veredictoText).toBeDefined();
    fireEvent.click(veredictoText);
    await writeComment(view, "comentario en texto");

    await waitFor(() => {
      expect(storedComments(view)).toHaveLength(2);
    });
  });
});
