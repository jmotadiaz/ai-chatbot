import { describe, expect, it } from "vitest";
import {
  buildChangedFiles,
  parsePorcelainStatus,
  parseUnifiedZeroDiff,
} from "@/lib/features/code/git-diff-parse";

describe("parsePorcelainStatus", () => {
  it("maps porcelain codes to statuses", () => {
    const output = [
      " M src/a.ts",
      "M  src/b.ts",
      "A  src/new.ts",
      " D src/gone.ts",
      "?? notes.md",
      "R  old.ts -> renamed.ts",
      "",
    ].join("\n");
    expect(parsePorcelainStatus(output)).toEqual([
      { path: "src/a.ts", status: "modified" },
      { path: "src/b.ts", status: "modified" },
      { path: "src/new.ts", status: "added" },
      { path: "src/gone.ts", status: "deleted" },
      { path: "notes.md", status: "untracked" },
      { path: "renamed.ts", status: "renamed" },
    ]);
  });

  it("unquotes paths with special characters", () => {
    expect(parsePorcelainStatus(' M "src/wei\\"rd.ts"')).toEqual([
      { path: 'src/wei"rd.ts', status: "modified" },
    ]);
  });
});

describe("parseUnifiedZeroDiff", () => {
  const diff = [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -10,2 +10,3 @@ context",
    "+line",
    "@@ -20 +22 @@",
    "+line",
    "@@ -30,2 +31,0 @@",
    "-gone",
    "diff --git a/src/b.ts b/dev/null",
    "--- a/src/b.ts",
    "+++ /dev/null",
    "@@ -1,5 +0,0 @@",
  ].join("\n");

  it("extracts new-file line ranges and skips deletion-only hunks", () => {
    const ranges = parseUnifiedZeroDiff(diff);
    expect(ranges.get("src/a.ts")).toEqual([
      { start: 10, end: 12 },
      { start: 22, end: 22 },
    ]);
    expect(ranges.has("src/b.ts")).toBe(false);
  });
});

describe("buildChangedFiles", () => {
  it("attaches ranges to tracked files and none to untracked/deleted", () => {
    const files = buildChangedFiles(
      [
        { path: "src/a.ts", status: "modified" },
        { path: "notes.md", status: "untracked" },
        { path: "src/gone.ts", status: "deleted" },
      ],
      new Map([
        ["src/a.ts", [{ start: 1, end: 2 }]],
        ["src/gone.ts", [{ start: 9, end: 9 }]],
      ]),
    );
    expect(files).toEqual([
      { path: "src/a.ts", status: "modified", changedRanges: [{ start: 1, end: 2 }] },
      { path: "notes.md", status: "untracked", changedRanges: [] },
      { path: "src/gone.ts", status: "deleted", changedRanges: [] },
    ]);
  });
});
