import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  acquireTraceSink: async () => null,
  releaseTraceSink: async () => {},
  retainTraceSink: () => async () => {},
  setTraceSessionId: () => {},
  getTraceLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    startTimer: () => () => {},
  }),
}));

const { handleRpc, summarizeRpcParams } = await import("../../src/transports/http");
const { __resetSessionsForTests } = await import("../../src/session-manager");

beforeEach(() => {
  __resetSessionsForTests();
});

async function rpcError(params: unknown) {
  const res = await handleRpc(
    JSON.stringify({ jsonrpc: "2.0", method: "connectToSession", params, id: 1 }),
  );
  return (await res.json()) as { error?: { code: number; message: string } };
}

describe("connectToSession RPC param validation", () => {
  it("rejects a connect request with no cursor", async () => {
    const body = await rpcError({ sessionId: "s1" });
    expect(body.error).toEqual({
      code: -32602,
      message: "afterSeq and epoch are required",
    });
  });

  it("rejects a connect request missing epoch", async () => {
    const body = await rpcError({ sessionId: "s1", afterSeq: 0 });
    expect(body.error).toEqual({
      code: -32602,
      message: "afterSeq and epoch are required",
    });
  });

  it("rejects a connect request missing afterSeq", async () => {
    const body = await rpcError({ sessionId: "s1", epoch: "epoch-1" });
    expect(body.error).toEqual({
      code: -32602,
      message: "afterSeq and epoch are required",
    });
  });
});

describe("summarizeRpcParams", () => {
  it("never includes attachment payloads for sendPrompt, only counts", () => {
    const summary = summarizeRpcParams("sendPrompt", {
      sessionId: "s1",
      prompt: "hi",
      messages: [
        {
          id: "u1",
          role: "user",
          content: [
            { type: "text", text: "hi" },
            {
              type: "image",
              source: { type: "data", value: "a".repeat(5000), mimeType: "image/png" },
            },
            {
              type: "document",
              source: { type: "data", value: "b".repeat(5000), mimeType: "text/plain" },
              metadata: { filename: "notes.txt" },
            },
          ],
        },
      ],
    });

    expect(summary).toEqual({
      sessionId: "s1",
      promptLength: 2,
      messageCount: 1,
      lastMessagePartCount: 3,
      imageCount: 1,
      documentCount: 1,
      hasTraceRunId: false,
    });
    expect(JSON.stringify(summary)).not.toContain("aaaa");
    expect(JSON.stringify(summary)).not.toContain("bbbb");
  });
});
