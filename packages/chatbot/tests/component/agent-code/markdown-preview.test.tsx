/** @vitest-environment jsdom */
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
    expect(blocks.map(({ kind }) => kind)).toEqual([
      "other",
      "other",
      "list",
      "code",
    ]);
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

  it("anchors a comment to the clicked line inside a fenced code block", () => {
    const onSelectLine = vi.fn();
    const view = render(
      <MarkdownPreview
        content={"# Title\n\n```ts\nconst x = 1;\nconst y = 2;\n```\n"}
        commentsByLine={new Map()}
        selectedLine={null}
        onSelectLine={onSelectLine}
        renderComposer={() => null}
      />,
    );

    // The fence sits on line 3, so its two code lines are 4 and 5.
    fireEvent.click(view.getByRole("button", { name: "Line 5" }));

    expect(onSelectLine).toHaveBeenCalledWith(5);
    expect(view.getByRole("button", { name: "Line 4" })).toBeTruthy();
    expect(view.queryByRole("button", { name: "Line 3" })).toBeNull();
  });

  it("renders the composer next to the selected code line", () => {
    const view = render(
      <MarkdownPreview
        content={"```ts\nconst x = 1;\nconst y = 2;\n```\n"}
        commentsByLine={new Map()}
        selectedLine={3}
        onSelectLine={vi.fn()}
        renderComposer={(line) => <div data-testid="composer">{line}</div>}
      />,
    );

    expect(view.getByTestId("composer").textContent).toBe("3");
  });

  it("anchors a comment to the clicked table row", async () => {
    const onSelectLine = vi.fn();
    const view = render(
      <MarkdownPreview
        content={"Intro\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n"}
        commentsByLine={new Map()}
        selectedLine={null}
        onSelectLine={onSelectLine}
        renderComposer={() => null}
      />,
    );

    // The header row is line 3, the delimiter line 4, so the body rows are 5-6.
    const row = await waitFor(() =>
      view.getByRole("row", { name: "Comment on line 6" }),
    );
    fireEvent.click(row);

    expect(onSelectLine).toHaveBeenCalledWith(6);
    expect(onSelectLine).not.toHaveBeenCalledWith(3);
  });

  it("keeps table rows in sync with the selection despite Streamdown's memo", async () => {
    const content = "| a | b |\n| --- | --- |\n| 1 | 2 |\n";
    const view = render(
      <MarkdownPreview
        content={content}
        commentsByLine={new Map()}
        selectedLine={null}
        onSelectLine={vi.fn()}
        renderComposer={(line) => <div data-testid="composer">{line}</div>}
      />,
    );

    const row = await waitFor(() =>
      view.getByRole("row", { name: "Comment on line 3" }),
    );
    expect(row.className).not.toContain("bg-blue-500/10");

    view.rerender(
      <MarkdownPreview
        content={content}
        commentsByLine={new Map()}
        selectedLine={3}
        onSelectLine={vi.fn()}
        renderComposer={(line) => <div data-testid="composer">{line}</div>}
      />,
    );

    await waitFor(() => {
      expect(
        view.getByRole("row", { name: "Comment on line 3" }).className,
      ).toContain("bg-blue-500/10");
    });
    expect(view.getByTestId("composer").textContent).toBe("3");
  });

  it("anchors a comment to the clicked list item", async () => {
    const onSelectLine = vi.fn();
    const view = render(
      <MarkdownPreview
        content={"Intro\n\n- first\n- second\n- third\n"}
        commentsByLine={new Map()}
        selectedLine={null}
        onSelectLine={onSelectLine}
        renderComposer={() => null}
      />,
    );

    const item = await waitFor(() =>
      view.getByRole("listitem", { name: "Comment on line 4" }),
    );
    fireEvent.click(item);

    expect(onSelectLine).toHaveBeenCalledWith(4);
    expect(onSelectLine).not.toHaveBeenCalledWith(3);
  });

  it("anchors a nested list item without selecting its parent", async () => {
    const onSelectLine = vi.fn();
    const view = render(
      <MarkdownPreview
        content={"- outer\n  - inner\n"}
        commentsByLine={new Map()}
        selectedLine={null}
        onSelectLine={onSelectLine}
        renderComposer={() => null}
      />,
    );

    const inner = await waitFor(() =>
      view.getByRole("listitem", { name: "Comment on line 2" }),
    );
    fireEvent.click(inner);

    expect(onSelectLine).toHaveBeenCalledTimes(1);
    expect(onSelectLine).toHaveBeenCalledWith(2);
  });

  it("renders the composer directly under the selected list item", async () => {
    const view = render(
      <MarkdownPreview
        content={"Intro\n\n- first\n- second\n- third\n"}
        commentsByLine={new Map()}
        selectedLine={3}
        onSelectLine={vi.fn()}
        renderComposer={(line) => <div data-testid="composer">{line}</div>}
      />,
    );

    const item = await waitFor(() =>
      view.getByRole("listitem", { name: "Comment on line 3" }),
    );
    const composer = view.getByTestId("composer");
    expect(composer.textContent).toBe("3");
    // The composer lives in a sibling `<li>` right under the item, not at
    // the end of the `<ul>`.
    const wrapper = composer.closest("li[data-line-composer]");
    expect(wrapper?.tagName).toBe("LI");
    expect(wrapper?.getAttribute("data-line-composer")).toBe("3");
    expect(item.nextElementSibling).toBe(wrapper);
    expect(view.queryAllByTestId("composer")).toHaveLength(1);
  });

  it("renders the composer under a middle list item instead of the end of the list", async () => {
    const view = render(
      <MarkdownPreview
        content={"Intro\n\n- first\n- second\n- third\n"}
        commentsByLine={new Map()}
        selectedLine={4}
        onSelectLine={vi.fn()}
        renderComposer={(line) => <div data-testid="composer">{line}</div>}
      />,
    );

    const second = await waitFor(() =>
      view.getByRole("listitem", { name: "Comment on line 4" }),
    );
    const third = view.getByRole("listitem", { name: "Comment on line 5" });
    const composer = view.getByTestId("composer");
    const wrapper = composer.closest("li[data-line-composer]");
    expect(second.nextElementSibling).toBe(wrapper);
    // The rest of the list still follows the composer.
    expect(wrapper?.nextElementSibling).toBe(third);
  });

  it("renders the composer directly under the selected table row", async () => {
    const view = render(
      <MarkdownPreview
        content={"Intro\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n"}
        commentsByLine={new Map()}
        selectedLine={6}
        onSelectLine={vi.fn()}
        renderComposer={(line) => <div data-testid="composer">{line}</div>}
      />,
    );

    const row = await waitFor(() =>
      view.getByRole("row", { name: "Comment on line 6" }),
    );
    const composer = view.getByTestId("composer");
    expect(composer.textContent).toBe("6");
    // The composer lives in a sibling `<tr>` right under the row, not below
    // the whole table.
    const wrapper = composer.closest("tr[data-line-composer]");
    expect(wrapper?.tagName).toBe("TR");
    expect(row.nextElementSibling).toBe(wrapper);
    expect(view.queryAllByTestId("composer")).toHaveLength(1);
  });

  it("renders a single block-end composer when a quote opens with a list", async () => {
    const view = render(
      <MarkdownPreview
        content={"> - quoted\n"}
        commentsByLine={new Map()}
        selectedLine={1}
        onSelectLine={vi.fn()}
        renderComposer={(line) => <div data-testid="composer">{line}</div>}
      />,
    );

    await waitFor(() =>
      view.getByRole("listitem", { name: "Comment on line 1" }),
    );
    // The item sits on the block's first line, so it defers to the block-end
    // composer instead of rendering a second one inline.
    expect(view.queryAllByTestId("composer")).toHaveLength(1);
    expect(view.getByTestId("composer").closest("li")).toBeNull();
  });

  it("does not select a line when a link inside an item is clicked", async () => {
    const onSelectLine = vi.fn();
    const view = render(
      <FileBrowserProvider project="proj" sessionId="s1">
        <MarkdownPreview
          content={"- [docs](https://example.com)\n"}
          commentsByLine={new Map()}
          selectedLine={null}
          onSelectLine={onSelectLine}
          renderComposer={() => null}
        />
      </FileBrowserProvider>,
    );

    fireEvent.click(await waitFor(() => view.getByRole("link", { name: "docs" })));

    expect(onSelectLine).not.toHaveBeenCalled();
  });

  it("highlights a fenced block with its own language", async () => {
    const view = render(
      <MarkdownPreview
        content={"```ts\nconst x = 1;\n```\n"}
        commentsByLine={new Map()}
        selectedLine={null}
        onSelectLine={vi.fn()}
        renderComposer={() => null}
      />,
    );

    const line = view.getByRole("button", { name: "Line 2" });
    // The Markdown grammar leaves fence bodies as one uncoloured run, so more
    // than one coloured token means the TypeScript grammar was applied.
    await waitFor(() => {
      const coloured = [...line.querySelectorAll("span[style*='color']")];
      expect(coloured.length).toBeGreaterThan(1);
    });
    expect(line.textContent).toContain("const x = 1;");
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
