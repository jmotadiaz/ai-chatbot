import { describe, it, expect } from "vitest";
import { convertReadableStreamToArray } from "ai/test";
import {
  textStream,
  reasoningStream,
  toolCallStream,
  fileStream,
  errorStream,
} from "@/tests/mocks/ai/helpers/streams";

describe("textStream", () => {
  it("emits a complete text response with finish", async () => {
    const result = textStream("hello world");
    const chunks = await convertReadableStreamToArray(result.stream);

    expect(chunks).toContainEqual({ type: "text-delta", id: "text-1", delta: "hello world" });
    expect(chunks.at(-1)).toMatchObject({ type: "finish", finishReason: { unified: "stop" } });
  });
});

describe("reasoningStream", () => {
  it("emits reasoning chunks followed by text", async () => {
    const result = reasoningStream("Let me think", "Answer: 42");
    const chunks = await convertReadableStreamToArray(result.stream);

    expect(chunks).toContainEqual({ type: "reasoning-delta", id: "reasoning-1", delta: "Let me think" });
    expect(chunks).toContainEqual({ type: "text-delta", id: "text-1", delta: "Answer: 42" });
  });
});

describe("toolCallStream", () => {
  it("emits a tool call and finishes with reason tool-calls", async () => {
    const result = toolCallStream("webSearch", { q: "x" });
    const chunks = await convertReadableStreamToArray(result.stream);

    const toolCall = chunks.find((c) => c.type === "tool-call");
    expect(toolCall).toMatchObject({ type: "tool-call", toolName: "webSearch" });

    const finish = chunks.find((c) => c.type === "finish");
    expect(finish).toMatchObject({ finishReason: { unified: "tool-calls" } });
  });
});

describe("fileStream", () => {
  it("emits a file chunk and a text chunk with finish", async () => {
    const result = fileStream("image/png", "BASE64DATA", "Description");
    const chunks = await convertReadableStreamToArray(result.stream);

    expect(chunks).toContainEqual({
      type: "file",
      mediaType: "image/png",
      data: "BASE64DATA",
    });
    expect(chunks).toContainEqual({ type: "text-delta", id: "text-1", delta: "Description" });
  });
});

describe("errorStream", () => {
  it("emits an error chunk and a finish chunk", async () => {
    const err = new Error("boom");
    const result = errorStream(err);
    const chunks = await convertReadableStreamToArray(result.stream);

    expect(chunks).toContainEqual({ type: "error", error: err });
    expect(chunks.at(-1)).toMatchObject({ type: "finish" });
  });
});
