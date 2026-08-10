/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CodeViewFrame,
  type LoadState,
} from "@/components/code/file-browser/code-view-frame";
import {
  FileBrowserProvider,
  useFileBrowser,
} from "@/components/code/file-browser/file-browser-provider";

afterEach(() => {
  cleanup();
  // The store persists pending comments per session id, so tests would
  // otherwise inherit each other's comments through localStorage.
  window.localStorage.clear();
});

const CONTENT = [
  "# Doc",
  "",
  "```ts",
  "const x = 1;",
  "```",
  "",
  "| a | b |",
  "| --- | --- |",
  "| 1 | 2 |",
  "",
].join("\n");

function readyLoad(content: string): LoadState {
  return {
    status: "ready",
    sourceContent: content,
    lines: content.split("\n").map((line, index) => ({
      id: `${index + 1}`,
      content: line,
      tokens: [],
      oldLineNumber: null,
      newLineNumber: index + 1,
      changeKind: "unchanged" as const,
      navigationIndex: null,
    })),
  };
}

const CommentsProbe: React.FC = () => {
  const { state } = useFileBrowser();
  return (
    <ul data-testid="comments">
      {state.pendingComments.map((comment) => (
        <li key={comment.id}>{`${comment.startLine}|${comment.lineText}|${comment.text}`}</li>
      ))}
    </ul>
  );
};

function renderFrame() {
  return render(
    <FileBrowserProvider project="proj" sessionId="s1">
      <CodeViewFrame
        path="docs/guide.md"
        load={readyLoad(CONTENT)}
        navigationCount={0}
        selectorForIndex={() => null}
        onBack={vi.fn()}
      />
      <CommentsProbe />
    </FileBrowserProvider>,
  );
}

async function writeComment(view: ReturnType<typeof renderFrame>, text: string) {
  const textarea = await waitFor(() => view.getByPlaceholderText("Leave a comment…"));
  fireEvent.change(textarea, { target: { value: text } });
  fireEvent.click(view.getByRole("button", { name: "Comment" }));
}

describe("Markdown preview line comments", () => {
  it("stores a comment on the exact code line inside a fence", async () => {
    const view = renderFrame();

    // The fence opens on line 3, so its single code line is line 4.
    fireEvent.click(await waitFor(() => view.getByRole("button", { name: "Line 4" })));
    await writeComment(view, "rename this");

    await waitFor(() => {
      expect(view.getByTestId("comments").textContent).toBe(
        "4|const x = 1;|rename this",
      );
    });
  });

  it("stores a comment on the exact table row", async () => {
    const view = renderFrame();

    // Header row is line 7, the delimiter line 8, so the body row is line 9.
    fireEvent.click(
      await waitFor(() => view.getByRole("row", { name: "Comment on line 9" })),
    );
    await writeComment(view, "wrong value");

    await waitFor(() => {
      expect(view.getByTestId("comments").textContent).toBe(
        "9|| 1 | 2 ||wrong value",
      );
    });
  });

  it("keeps block-level comments working for prose", async () => {
    const view = renderFrame();

    fireEvent.click(
      await waitFor(() =>
        view.getByRole("button", {
          name: "Comment on Markdown block starting at line 1",
        }),
      ),
    );
    await writeComment(view, "retitle");

    await waitFor(() => {
      expect(view.getByTestId("comments").textContent).toBe("1|# Doc|retitle");
    });
  });
});
