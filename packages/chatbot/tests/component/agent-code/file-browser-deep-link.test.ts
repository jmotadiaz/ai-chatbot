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

describe("applyLocation (same-route deep links)", () => {
  it("opens a tree file with breadcrumbs seeded from the dirname", () => {
    const store = createFileBrowserStore("s1");
    store.applyLocation({ scope: "tree", file: "personas/Chus.md" });
    expect(store.getSnapshot().scope).toBe("tree");
    expect(store.getSnapshot().activeFile).toBe("personas/Chus.md");
    expect(store.getSnapshot().pathStack).toEqual(["personas"]);
  });

  it("opens the diff view for an uncommitted file", () => {
    const store = createFileBrowserStore("s1");
    store.applyLocation({ scope: "uncommitted", file: "src/a.ts" });
    expect(store.getSnapshot().scope).toBe("uncommitted");
    expect(store.getSnapshot().activeFile).toBe("src/a.ts");
    expect(store.getSnapshot().pathStack).toEqual([]);
  });

  it("ignores an empty location instead of resetting live state", () => {
    const store = createFileBrowserStore("s1", {
      scope: "tree",
      file: "personas/Chus.md",
    });
    store.applyLocation({});
    expect(store.getSnapshot().activeFile).toBe("personas/Chus.md");
  });

  it("keeps pending comments across navigations", () => {
    const store = createFileBrowserStore("s1");
    const comment = {
      id: "c1",
      file: "home.md",
      startLine: 1,
      endLine: 1,
      lineText: "# Home",
      text: "note",
      createdAt: 1,
    };
    store.upsertComment(comment);
    store.applyLocation({ scope: "tree", file: "inbox.md" });
    expect(store.getSnapshot().pendingComments).toEqual([comment]);
  });
});
