import { describe, expect, it } from "vitest";
import { serializeComments } from "@/components/code/file-browser/serialize-comments";
import type {
  FilePendingComment,
  PendingComment,
  ResponsePendingComment,
} from "@/components/code/file-browser/types";

function comment(overrides: Partial<FilePendingComment> = {}): PendingComment {
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

function responseComment(
  overrides: Partial<ResponsePendingComment> = {},
): ResponsePendingComment {
  return {
    id: "rc1",
    kind: "response",
    messageId: "a-1",
    turnNumber: 2,
    startLine: 10,
    endLine: 12,
    lineText: "const a = 1;\nconst b = 2;\nconst c = 3;",
    text: "revisa este bloque",
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

  it("serializes response comments with turn, lines, message id, and indented full source", () => {
    const result = serializeComments("sigue con esto", [
      responseComment({
        turnNumber: 2,
        messageId: "a-42",
        startLine: 15,
        endLine: 16,
        lineText: "const x = 10;\nconst y = 20;",
        text: "renombra x a count",
      }),
    ]);

    expect(result).toBe(
      "sigue con esto\n\n---\n" +
        "Response comments:\n\n" +
        "### Response 2\n" +
        "- Lines 15-16\n" +
        "  Message ID: a-42\n" +
        "  Source:\n" +
        "    const x = 10;\n" +
        "    const y = 20;\n" +
        "  Comment: renombra x a count",
    );
  });

  it("combines both file review comments and response comments in separate sections", () => {
    const result = serializeComments("", [
      comment({ file: "src/a.ts", startLine: 5, endLine: 5, text: "revisa file" }),
      responseComment({ turnNumber: 1, messageId: "a-1", startLine: 1, endLine: 1, text: "revisa response" }),
    ]);

    expect(result).toContain("Code review comments:\n\n### src/a.ts");
    expect(result).toContain("Response comments:\n\n### Response 1");
  });
});
