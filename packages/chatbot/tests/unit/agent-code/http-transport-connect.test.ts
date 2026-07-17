import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  setTraceSessionId: () => {},
  getTraceLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    startTimer: () => () => {},
  }),
}));

const { handleRpc } = await import("coding-agent/transports/http");
const { __resetSessionsForTests } = await import("coding-agent/session-manager");

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
