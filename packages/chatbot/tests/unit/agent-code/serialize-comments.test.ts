import { describe, expect, it } from "vitest";
import { serializeComments } from "@/components/code/file-browser/serialize-comments";
import type { PendingComment } from "@/components/code/file-browser/types";

function comment(overrides: Partial<PendingComment>): PendingComment {
  return {
    id: "c1",
    file: "src/lib/auth.ts",
    startLine: 42,
    endLine: 42,
    lineText: "const token = getToken();",
    text: "valida que no esté vacío",
    createdAt: 0,
    ...overrides,
  };
}

describe("serializeComments", () => {
  it("returns the prompt untouched when there are no comments", () => {
    expect(serializeComments("hola agente", [])).toBe("hola agente");
  });

  it("returns only the comments block when the prompt is empty", () => {
    const result = serializeComments("  ", [comment({})]);
    expect(result).toBe(
      "Code review comments:\n\n" +
        "### src/lib/auth.ts\n" +
        "- Line 42: `const token = getToken();` — valida que no esté vacío",
    );
  });

  it("joins prompt and comments with a separator", () => {
    const result = serializeComments("arregla esto", [comment({})]);
    expect(result.startsWith("arregla esto\n\n---\nCode review comments:")).toBe(
      true,
    );
  });

  it("groups comments by file and sorts by line inside each file", () => {
    const result = serializeComments("", [
      comment({ id: "a", file: "src/app/page.tsx", startLine: 12, endLine: 12, lineText: "", text: "import sin usar" }),
      comment({ id: "b", startLine: 42, endLine: 42 }),
      comment({ id: "c", startLine: 7, endLine: 7, lineText: "", text: "typo" }),
    ]);
    expect(result).toBe(
      "Code review comments:\n\n" +
        "### src/app/page.tsx\n" +
        "- Line 12: import sin usar\n\n" +
        "### src/lib/auth.ts\n" +
        "- Line 7: typo\n" +
        "- Line 42: `const token = getToken();` — valida que no esté vacío",
    );
  });

  it("omits the snippet when the line text is blank and strips backticks", () => {
    const result = serializeComments("", [
      comment({ lineText: "const s = `tpl`;" }),
    ]);
    expect(result).toContain("`const s = tpl;`");
  });
});
