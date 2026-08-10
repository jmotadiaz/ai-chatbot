/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { createFileBrowserStore } from "@/components/code/file-browser/file-browser-provider";

describe("createFileBrowserStore deep-link initial state", () => {
  it("defaults to the uncommitted list", () => {
    const state = createFileBrowserStore("s1").getSnapshot();
    expect(state.scope).toBe("uncommitted");
    expect(state.activeFile).toBeNull();
    expect(state.pathStack).toEqual([]);
  });

  it("opens the diff view for an uncommitted file", () => {
    const state = createFileBrowserStore("s1", {
      scope: "uncommitted",
      file: "src/a.ts",
    }).getSnapshot();
    expect(state.scope).toBe("uncommitted");
    expect(state.activeFile).toBe("src/a.ts");
    expect(state.pathStack).toEqual([]);
  });

  it("opens the full-file view with breadcrumbs seeded from the dirname", () => {
    const state = createFileBrowserStore("s1", {
      scope: "tree",
      file: "src/lib/utils.ts",
    }).getSnapshot();
    expect(state.scope).toBe("tree");
    expect(state.activeFile).toBe("src/lib/utils.ts");
    expect(state.pathStack).toEqual(["src", "lib"]);
  });

  it("keeps a root-level file's breadcrumb at the project root", () => {
    const state = createFileBrowserStore("s1", {
      scope: "tree",
      file: "README.md",
    }).getSnapshot();
    expect(state.pathStack).toEqual([]);
  });
});
