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
 * Hardening del parseo (ticket 10, incidente 2026-09-02): un POST con body
 * vacío/malformado a /rpc tiraba el proceso entero (JSON.parse fuera de
 * try/catch → unhandledRejection). El contrato ahora es: NUNCA lanzar por el
 * body; responder JSON-RPC error. 3015 está expuesto en la LAN sin auth.
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

describe("handleRpc parseo defensivo del body", () => {
  it("body vacío → -32700 Parse error, sin tumbar el proceso", async () => {
    await expectJsonRpcError("", -32700);
  });

  it("body no-JSON → -32700", async () => {
    await expectJsonRpcError("not-json{", -32700);
  });

  it("JSON que no es objeto (null) → -32700", async () => {
    await expectJsonRpcError("null", -32700);
  });

  it("objeto válido sin method → -32601 Method not found (regresión del default)", async () => {
    await expectJsonRpcError('{"id":1}', -32601);
  });
});
