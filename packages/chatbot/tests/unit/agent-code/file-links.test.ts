import { describe, it, expect } from "vitest";
import {
  diffViewHref,
  fileViewHref,
  isSafeRelativePath,
  parseFileReferenceHref,
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
