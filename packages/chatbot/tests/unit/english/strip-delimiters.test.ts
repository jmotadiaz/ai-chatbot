import { describe, expect, it } from "vitest";
import type { TextStreamPart, ToolSet } from "ai";
import { stripDelimiters } from "../../../lib/features/english/workflows/strip-delimiters";
import type { Delimiter } from "../../../lib/features/english/workflows/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const pair: Delimiter = { open: "«", close: "»" };

const delta = (text: string): TextStreamPart<ToolSet> => ({
  type: "text-delta",
  id: "text-1",
  text,
});

const start: TextStreamPart<ToolSet> = { type: "text-start", id: "text-1" };
const end: TextStreamPart<ToolSet> = { type: "text-end", id: "text-1" };

/** Pipes a fixed sequence of parts through the transform and collects the result. */
const collect = async (
  parts: TextStreamPart<ToolSet>[],
  delimiter: Delimiter | null,
): Promise<TextStreamPart<ToolSet>[]> => {
  const source = new ReadableStream<TextStreamPart<ToolSet>>({
    start(controller) {
      parts.forEach((part) => controller.enqueue(part));
      controller.close();
    },
  });
  const transformed = source.pipeThrough(
    stripDelimiters<ToolSet>(delimiter)({ tools: {}, stopStream: () => {} }),
  );

  const emitted: TextStreamPart<ToolSet>[] = [];
  for await (const part of transformed) emitted.push(part);
  return emitted;
};

const textOf = (parts: TextStreamPart<ToolSet>[]): string =>
  parts.reduce(
    (acc, part) => (part.type === "text-delta" ? acc + part.text : acc),
    "",
  );

// ─── stripDelimiters ──────────────────────────────────────────────────────────

describe("stripDelimiters", () => {
  it("drops the opening and closing markers", async () => {
    const parts = await collect([delta("«hola»")], pair);

    expect(textOf(parts)).toBe("hola");
  });

  it("drops markers split across chunks", async () => {
    const parts = await collect([delta("«"), delta("hola"), delta("»")], pair);

    expect(textOf(parts)).toBe("hola");
  });

  it("handles a multi-character closing marker split across chunks", async () => {
    const fence: Delimiter = { open: "```", close: "```" };

    const parts = await collect(
      [delta("``"), delta("`hola`"), delta("``")],
      fence,
    );

    expect(textOf(parts)).toBe("hola");
  });

  it("keeps a stray opening marker inside the text", async () => {
    const parts = await collect([delta("«un « suelto»")], pair);

    expect(textOf(parts)).toBe("un « suelto");
  });

  it("keeps a closing marker that is not trailing", async () => {
    const parts = await collect([delta("a » b")], pair);

    expect(textOf(parts)).toBe("a » b");
  });

  it("drops trailing whitespace after the closing marker", async () => {
    const parts = await collect([delta("hola»\n")], pair);

    expect(textOf(parts)).toBe("hola");
  });

  it("preserves legitimate trailing whitespace", async () => {
    const parts = await collect([delta("hola ")], pair);

    expect(textOf(parts)).toBe("hola ");
  });

  it("strips an opening marker even without a closing marker", async () => {
    const parts = await collect([delta("«hola")], pair);

    expect(textOf(parts)).toBe("hola");
  });

  it("passes the stream through untouched when no delimiter was chosen", async () => {
    const parts = await collect([delta("«hola»")], null);

    expect(textOf(parts)).toBe("«hola»");
  });

  it("preserves non-text parts and emits flushed text before text-end", async () => {
    const parts = await collect([start, delta("«hola»"), end], pair);

    expect(parts.map((part) => part.type)).toEqual([
      "text-start",
      "text-delta",
      "text-end",
    ]);
    expect(textOf(parts)).toBe("hola");
  });
});
