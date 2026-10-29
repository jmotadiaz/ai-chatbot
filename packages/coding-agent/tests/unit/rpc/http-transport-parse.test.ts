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

const { handleRpc } = await import("../../../src/transports/http");
import { sessionRegistry } from "../../../src/session/session-registry";

beforeEach(() => {
  sessionRegistry.clear();
});

/**
 * In-process parser guarantee for `handleRpc` (2026-09-02 incident: a POST with
 * an empty/malformed body to /rpc took down the whole process because JSON.parse
 * ran outside try/catch). The contract is: never throw over the body; answer a
 * JSON-RPC error.
 *
 * Scope: this file calls the handler directly, so it proves the parse contract,
 * NOT that the worker survives a malformed body over real HTTP on port 3015.
 * Process survival over the wire is not claimed here; the HTTP path is covered by
 * tests/unit/artifacts/artifacts-server.test.ts (real isolated server, `POST /rpc`).
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
