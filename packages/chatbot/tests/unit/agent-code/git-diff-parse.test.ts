import { describe, expect, it } from "vitest";
import {
  buildChangedFiles,
  parsePorcelainStatus,
  parseUnifiedDiff,
  parseUnifiedZeroDiff,
} from "@/lib/features/code/file-browser/git-diff-parse";

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

  it("preserves deleted lines and their old line numbers", () => {
    const parsed = parseUnifiedDiff(diff).get("src/a.ts");
    expect(parsed?.hunks[2]).toMatchObject({
      oldStart: 30,
      newStart: 31,
      lines: [
        {
          kind: "deleted",
          content: "gone",
          oldLineNumber: 30,
          newLineNumber: null,
        },
      ],
    });
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
        [
          "src/a.ts",
          {
            hunks: [
              {
                oldStart: 1,
                oldCount: 0,
                newStart: 1,
                newCount: 2,
                lines: [
                  {
                    kind: "added",
                    content: "one",
                    oldLineNumber: null,
                    newLineNumber: 1,
                  },
                  {
                    kind: "added",
                    content: "two",
                    oldLineNumber: null,
                    newLineNumber: 2,
                  },
                ],
              },
            ],
          },
        ],
        [
          "src/gone.ts",
          {
            hunks: [
              {
                oldStart: 9,
                oldCount: 1,
                newStart: 9,
                newCount: 0,
                lines: [
                  {
                    kind: "deleted",
                    content: "gone",
                    oldLineNumber: 9,
                    newLineNumber: null,
                  },
                ],
              },
            ],
          },
        ],
      ]),
    );
    expect(files).toEqual([
      {
        path: "src/a.ts",
        status: "modified",
        changedRanges: [{ start: 1, end: 2 }],
        diff: expect.any(Object),
      },
      {
        path: "notes.md",
        status: "untracked",
        changedRanges: [],
        diff: null,
      },
      {
        path: "src/gone.ts",
        status: "deleted",
        changedRanges: [],
        diff: expect.any(Object),
      },
    ]);
  });
});
