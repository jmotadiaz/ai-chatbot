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

const { handleRpc } = await import("../../src/transports/http");
import { sessionRegistry } from "../../src/session/session-registry";

beforeEach(() => {
  sessionRegistry.clear();
});

/**
 * Parsing hardening (ticket 10, 2026-09-02 incident): a POST with an
 * empty/malformed body to /rpc took down the whole process (JSON.parse outside
 * try/catch → unhandledRejection). The contract is now: NEVER throw over the
 * body; answer a JSON-RPC error. 3015 is exposed on the LAN without auth.
 */
async function expectJsonRpcError(body: string, code: number) {
  const res = await handleRpc(body);
  expect(res.status).toBe(200);
  const json = (await res.json()) as {
    jsonrpc: string;
    error?: { code: number };
  };
  expect(json.jsonrpc).toBe("2.0");
  expect(json.error?.code).toBe(code);
}

describe("handleRpc defensive body parsing", () => {
  it("empty body → -32700 Parse error, without taking down the process", async () => {
    await expectJsonRpcError("", -32700);
  });

  it("non-JSON body → -32700", async () => {
    await expectJsonRpcError("not-json{", -32700);
  });

  it("JSON that is not an object (null) → -32700", async () => {
    await expectJsonRpcError("null", -32700);
  });

  it("valid object without method → -32601 Method not found (default regression)", async () => {
    await expectJsonRpcError('{"id":1}', -32601);
  });
});
