import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import { createServer } from "node:http";
import { createGatewayScenario } from "@ai-chatbot/model-gateway-testing";
import { startGatewayServer } from "@ai-chatbot/model-gateway-testing/server";
import type { GatewayServer } from "@ai-chatbot/model-gateway-testing/server";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  acquireTraceSink: async () => null,
  releaseTraceSink: async () => {},
  retainTraceSink: () => async () => {},
  setTraceSessionId: () => {},
  runWithTraceContext: (_ctx: unknown, fn: () => Promise<unknown>) => fn(),
  getTraceLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    startTimer: () => () => {},
  }),
}));

const { startHttpTransport } = await import("../../../src/transports/http");
const { sessionRegistry } = await import("../../../src/session/session-registry");
const { SessionEventLog } = await import("../../../src/agui/event-log");
const { createTestWorkerContext } = await import("../../helpers/test-context");
const { resetWorkerRuntimeConfigForTests } = await import(
  "../../../src/runtime/runtime-overrides"
);

let tmp: string;
let baseUrl: string;
let ctx: ReturnType<typeof createTestWorkerContext>;
let server: ReturnType<typeof startHttpTransport>;
let gateway: GatewayServer;

beforeAll(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "stream-error-server-"));

  gateway = await startGatewayServer(createGatewayScenario({ catalog: { public: [] } }));
  const gatewayUrl = gateway.url;

  const reservation = createServer();
  await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const { port } = reservation.address() as AddressInfo;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  baseUrl = `http://127.0.0.1:${port}`;

  ctx = createTestWorkerContext({
    gatewayUrl,
    apiKey: "test-gateway-key",
    artifactsDir: path.join(tmp, "artifacts"),
  });
  server = startHttpTransport({ port, host: "127.0.0.1", runtimeConfig: ctx.workerConfig });
  await new Promise<void>((resolve) => server.once("listening", resolve));
});

afterAll(async () => {
  server?.close();
  await gateway?.close();
  resetWorkerRuntimeConfigForTests();
  ctx?.cleanup();
  await rm(tmp, { recursive: true, force: true });
});

describe("HTTP transport stream error resilience", () => {
  it("survives stream errors like cursor epoch mismatch without crashing the server", async () => {
    // Seed a session in the registry
    const log = new SessionEventLog();
    sessionRegistry.set("test-session-1", {
      sessionId: "test-session-1",
      project: "p",
      runtime: { session: {} } as never,
      eventLog: log,
    });

    // Send a connectToSession request with a mismatched epoch
    let fetchError: unknown;
    try {
      const res = await fetch(`${baseUrl}/rpc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "connectToSession",
          params: {
            sessionId: "test-session-1",
            epoch: "mismatched-stale-epoch",
            afterSeq: 0,
          },
          id: 1,
        }),
      });

      const reader = res.body?.getReader();
      if (reader) {
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      }
    } catch (err) {
      fetchError = err;
    }

    // The client either saw fetch fail due to socket destroy or saw stream error
    expect(fetchError).toBeDefined();

    // Verify the server is still healthy and responds to subsequent requests
    const pingRes = await fetch(`${baseUrl}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "getAvailableModels",
        id: 2,
      }),
    });
    expect(pingRes.status).toBe(200);
    const data = (await pingRes.json()) as { result?: { models: unknown[] } };
    expect(data.result).toBeDefined();
  });
});
