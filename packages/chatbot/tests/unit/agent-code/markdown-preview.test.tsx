// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileBrowserProvider } from "@/components/code/file-browser/file-browser-provider";
import {
  MarkdownPreview,
  markdownBlocks,
} from "@/components/code/file-browser/markdown-preview";

afterEach(cleanup);

describe("markdownBlocks", () => {
  it("keeps the source line for each rendered Markdown block", () => {
    const blocks = markdownBlocks(
      "# Title\n\nA paragraph.\n\n- first\n- second\n\n```ts\nconst x = 1;\n```\n",
    );

    expect(blocks.map(({ lineNumber }) => lineNumber)).toEqual([1, 3, 5, 8]);
    expect(blocks[0]?.content).toBe("# Title\n\n");
    expect(blocks[1]?.content).toContain("A paragraph.");
    expect(blocks[2]?.content).toContain("- second");
    expect(blocks[3]?.content).toContain("const x = 1;");
  });

  it("selects the source line when a rendered block is clicked", () => {
    const onSelectLine = vi.fn();
    const view = render(
      <MarkdownPreview
        content={"# Title\n\nParagraph"}
        commentsByLine={new Map()}
        selectedLine={null}
        onSelectLine={onSelectLine}
        renderComposer={() => null}
      />,
    );

    fireEvent.click(
      view.getByRole("button", {
        name: "Comment on Markdown block starting at line 3",
      }),
    );

    expect(onSelectLine).toHaveBeenCalledWith(3);
    expect(view.getByTestId("markdown-preview").className).toContain(
      "space-y-4",
    );
  });

  it("routes file references through the file browser", async () => {
    const view = render(
      <FileBrowserProvider project="proj" sessionId="s1">
        <MarkdownPreview
          content="[Open file](file:src/app.ts)"
          commentsByLine={new Map()}
          selectedLine={null}
          onSelectLine={vi.fn()}
          renderComposer={() => null}
        />
      </FileBrowserProvider>,
    );

    await waitFor(() => {
      expect(view.getByTestId("agent-file-link").getAttribute("href")).toBe(
        "/agent/code/proj/s1/files?scope=tree&file=src%2Fapp.ts",
      );
    });
  });
});
