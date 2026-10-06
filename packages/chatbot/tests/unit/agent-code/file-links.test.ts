import { describe, it, expect } from "vitest";
import {
  diffViewHref,
  fileViewHref,
  initialLocationFrom,
  isSafeRelativePath,
  parseFileReferenceHref,
  resolveNoteLink,
} from "@/lib/features/code/file-browser/file-links";

describe("isSafeRelativePath", () => {
  it("accepts plain relative paths", () => {
    expect(isSafeRelativePath("src/lib/utils.ts")).toBe(true);
    expect(isSafeRelativePath("README.md")).toBe(true);
    expect(isSafeRelativePath("a b/c d.txt")).toBe(true);
  });

  it("rejects traversal, absolute, and malformed paths", () => {
    expect(isSafeRelativePath("")).toBe(false);
    expect(isSafeRelativePath("/etc/passwd")).toBe(false);
    expect(isSafeRelativePath("../secret")).toBe(false);
    expect(isSafeRelativePath("src/../../x")).toBe(false);
    expect(isSafeRelativePath("src//x")).toBe(false);
    expect(isSafeRelativePath("dir/")).toBe(false);
    expect(isSafeRelativePath("a\\b")).toBe(false);
    expect(isSafeRelativePath("./x")).toBe(false);
  });
});

describe("view hrefs", () => {
  it("builds diff-view deep links", () => {
    expect(diffViewHref("my proj", "s1", "src/a.ts")).toBe(
      "/agent/code/my%20proj/s1/files?scope=uncommitted&file=src%2Fa.ts",
    );
  });

  it("builds file-view deep links", () => {
    expect(fileViewHref("p", "s1", "src/a.ts")).toBe(
      "/agent/code/p/s1/files?scope=tree&file=src%2Fa.ts",
    );
  });
});

describe("resolveNoteLink", () => {
  const FROM_PROJECT_NOTE = "proyectos/Foo/Foo.md";
  const FROM_ISSUE_NOTE = "proyectos/Foo/issues/foo-arch.md";
  const FROM_ROOT_NOTE = "home.md";

  it("resolves relative note links against the container's directory", () => {
    expect(resolveNoteLink("../../personas/Chus.md", FROM_PROJECT_NOTE)).toEqual({
      kind: "navigate",
      path: "personas/Chus.md",
    });
    expect(resolveNoteLink("issues/foo-arch.md", FROM_PROJECT_NOTE)).toEqual({
      kind: "navigate",
      path: "proyectos/Foo/issues/foo-arch.md",
    });
  });

  it("resolves same-directory links from a root-level note", () => {
    expect(resolveNoteLink("inbox.md", FROM_ROOT_NOTE)).toEqual({
      kind: "navigate",
      path: "inbox.md",
    });
  });

  it("decodes percent-escaped paths", () => {
    expect(
      resolveNoteLink("../../../personas/Miguel%20Lopez.md", FROM_ISSUE_NOTE),
    ).toEqual({ kind: "navigate", path: "personas/Miguel Lopez.md" });
  });

  it("normalizes redundant segments", () => {
    expect(resolveNoteLink("./personas/./Chus.md", FROM_PROJECT_NOTE)).toEqual({
      kind: "navigate",
      path: "proyectos/Foo/personas/Chus.md",
    });
    expect(resolveNoteLink("personas/../personas/Chus.md", FROM_PROJECT_NOTE)).toEqual({
      kind: "navigate",
      path: "proyectos/Foo/personas/Chus.md",
    });
  });

  it("drops the fragment and navigates to the top of the target", () => {
    expect(resolveNoteLink("issues/foo-arch.md#contexto", FROM_PROJECT_NOTE)).toEqual({
      kind: "navigate",
      path: "proyectos/Foo/issues/foo-arch.md",
    });
  });

  it("classifies external links and fragments as other", () => {
    expect(resolveNoteLink("https://example.com", FROM_PROJECT_NOTE)).toEqual({
      kind: "other",
    });
    expect(resolveNoteLink("mailto:x@y.z", FROM_PROJECT_NOTE)).toEqual({
      kind: "other",
    });
    expect(resolveNoteLink("//example.com/a.md", FROM_PROJECT_NOTE)).toEqual({
      kind: "other",
    });
    expect(resolveNoteLink("#seccion", FROM_PROJECT_NOTE)).toEqual({
      kind: "other",
    });
    expect(resolveNoteLink("logo.png", FROM_PROJECT_NOTE)).toEqual({
      kind: "other",
    });
    expect(resolveNoteLink("issues", FROM_PROJECT_NOTE)).toEqual({
      kind: "other",
    });
  });

  it("classifies escapes and malformed paths as unsafe", () => {
    expect(resolveNoteLink("../../../outside.md", FROM_PROJECT_NOTE)).toEqual({
      kind: "unsafe",
    });
    expect(resolveNoteLink("../../../personas/Chus.md", FROM_ROOT_NOTE)).toEqual({
      kind: "unsafe",
    });
    expect(resolveNoteLink("/etc/passwd", FROM_PROJECT_NOTE)).toEqual({
      kind: "unsafe",
    });
    expect(resolveNoteLink("a\\b.md", FROM_PROJECT_NOTE)).toEqual({
      kind: "unsafe",
    });
    expect(resolveNoteLink("src/%zz.md", FROM_PROJECT_NOTE)).toEqual({
      kind: "unsafe",
    });
  });

  it("does not navigate without a container file", () => {
    expect(resolveNoteLink("personas/Chus.md", null)).toEqual({ kind: "other" });
  });
});

describe("initialLocationFrom", () => {
  it("keeps valid scopes and safe files", () => {
    expect(initialLocationFrom({ scope: "tree", file: "src/a.ts" })).toEqual({
      scope: "tree",
      file: "src/a.ts",
    });
    expect(initialLocationFrom({ scope: "uncommitted", file: "a.md" })).toEqual({
      scope: "uncommitted",
      file: "a.md",
    });
  });

  it("drops unknown scopes and unsafe files", () => {
    expect(initialLocationFrom({ scope: "bogus", file: "../etc/passwd" })).toEqual({});
    expect(initialLocationFrom({})).toEqual({});
  });

  it("ignores array-valued params", () => {
    expect(initialLocationFrom({ scope: ["tree"], file: ["a.md"] })).toEqual({});
  });
});

describe("parseFileReferenceHref", () => {
  it("parses file: references", () => {
    expect(parseFileReferenceHref("file:src/a.ts")).toBe("src/a.ts");
  });

  it("parses file:// references", () => {
    expect(parseFileReferenceHref("file://src/a.ts")).toBe("src/a.ts");
  });

  it("drops a trailing line suffix", () => {
    expect(parseFileReferenceHref("file:src/a.ts:42")).toBe("src/a.ts");
    expect(parseFileReferenceHref("file:src/a.ts:42-50")).toBe("src/a.ts");
  });

  it("decodes percent-encoded paths", () => {
    expect(parseFileReferenceHref("file:src/a%20b.ts")).toBe("src/a b.ts");
  });

  it("rejects non-file links and unsafe paths", () => {
    expect(parseFileReferenceHref(undefined)).toBeNull();
    expect(parseFileReferenceHref("https://example.com")).toBeNull();
    expect(parseFileReferenceHref("file:../outside.ts")).toBeNull();
    expect(parseFileReferenceHref("file:///etc/passwd")).toBeNull();
    expect(parseFileReferenceHref("file:src/%zz.ts")).toBeNull();
  });
});
