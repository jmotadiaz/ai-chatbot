import { describe, it, expect } from "vitest";
import {
  textChunks,
  reasoningChunks,
  toolCallChunks,
  fileChunks,
  errorChunk,
  finishChunk,
} from "@/tests/mocks/ai/helpers/chunks";

describe("textChunks", () => {
  it("produces start, delta, end sequence", () => {
    expect(textChunks("text-1", "hello")).toEqual([
      { type: "text-start", id: "text-1" },
      { type: "text-delta", id: "text-1", delta: "hello" },
      { type: "text-end", id: "text-1" },
    ]);
  });
});

describe("reasoningChunks", () => {
  it("produces reasoning start, delta, end sequence", () => {
    expect(reasoningChunks("r-1", "thinking...")).toEqual([
      { type: "reasoning-start", id: "r-1" },
      { type: "reasoning-delta", id: "r-1", delta: "thinking..." },
      { type: "reasoning-end", id: "r-1" },
    ]);
  });
});

describe("toolCallChunks", () => {
  it("emits tool-input chunks followed by a tool-call chunk", () => {
    const chunks = toolCallChunks("call-1", "webSearch", { query: "x" });
    expect(chunks).toHaveLength(4);
    expect(chunks[0]).toMatchObject({ type: "tool-input-start", toolName: "webSearch" });
    expect(chunks[1]).toMatchObject({ type: "tool-input-delta", delta: '{"query":"x"}' });
    expect(chunks[2]).toMatchObject({ type: "tool-input-end" });
    expect(chunks[3]).toMatchObject({ type: "tool-call", toolName: "webSearch" });
  });
});

describe("fileChunks", () => {
  it("emits a file chunk with the given mediaType and data", () => {
    expect(fileChunks("image/png", "BASE64DATA")).toEqual([
      { type: "file", mediaType: "image/png", data: "BASE64DATA" },
    ]);
  });
});

describe("errorChunk", () => {
  it("emits an error chunk with the given error", () => {
    const err = new Error("boom");
    expect(errorChunk(err)).toEqual({ type: "error", error: err });
  });
});

describe("finishChunk", () => {
  it("emits a finish chunk with the given reason", () => {
    expect(finishChunk("stop")).toMatchObject({
      type: "finish",
      finishReason: { unified: "stop", raw: "stop" },
    });
  });

  it("defaults to 'stop' reason", () => {
    expect(finishChunk()).toMatchObject({ finishReason: { unified: "stop" } });
  });
});
