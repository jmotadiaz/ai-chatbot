import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import { createServer } from "node:http";
import { createGatewayScenario } from "@ai-chatbot/model-gateway-testing";
import { startGatewayServer } from "@ai-chatbot/model-gateway-testing/server";
import type { GatewayServer } from "@ai-chatbot/model-gateway-testing/server";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
const { publishArtifact } = await import("../../../src/artifacts/artifacts");
const { createTestWorkerContext } = await import("../../helpers/test-context");
const { resetWorkerRuntimeConfigForTests } = await import(
  "../../../src/runtime/runtime-overrides"
);

/**
 * The worker's real HTTP server after the artifacts move to the Chatbot: the
 * worker keeps `POST /rpc` as its only surface, and it no longer serves
 * `GET /artifacts`. Published artifacts land on disk under the injected root,
 * where the Chatbot reads them.
 */

const REPORT = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>Architecture review — Coding Agent</title>
</head><body><h1>Candidates</h1></body></html>`;

let tmp: string;
let rootDir: string;
let baseUrl: string;
let ctx: ReturnType<typeof createTestWorkerContext>;
let server: ReturnType<typeof startHttpTransport>;
let gateway: GatewayServer;

beforeAll(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "artifacts-server-"));
  rootDir = path.join(tmp, "root");
  await mkdir(path.join(tmp, "generated"), { recursive: true });

  // Model Gateway on a real ephemeral origin (official toolkit): `POST /rpc
  // getAvailableModels` syncs the runtime catalog on first call, so the worker
  // needs a live `GET /v1/models/catalog`.
  gateway = await startGatewayServer(createGatewayScenario({ catalog: { public: [] } }));

  // Reserve the worker port, then release it for the transport to reuse.
  const reservation = createServer();
  await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const { port } = reservation.address() as AddressInfo;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  baseUrl = `http://127.0.0.1:${port}`;

  // DI of the composition root (ADR 0011 §6): the sandbox is injected as
  // process config, never through process.env.
  ctx = createTestWorkerContext({
    gatewayUrl: gateway.url,
    apiKey: "test-gateway-key",
    artifactsDir: rootDir,
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

describe("worker HTTP surface", () => {
  it("no longer serves GET /artifacts, its index or published files", async () => {
    const source = path.join(tmp, "generated", "review.html");
    await writeFile(source, REPORT, "utf-8");
    await publishArtifact({
      sourcePath: source,
      name: "review",
      rootDir,
      sessionId: "session-under-test",
      cwd: "/home/javier/projects/ai-chatbot",
    });

    // The artifact is on disk, where the Chatbot reads it. The worker still
    // refuses to serve it over HTTP.
    expect(await readFile(path.join(rootDir, "ai-chatbot", "review", "index.html"), "utf-8")).toBe(
      REPORT,
    );
    for (const route of ["/artifacts", "/artifacts/", "/artifacts/ai-chatbot/review/index.html"]) {
      const res = await fetch(`${baseUrl}${route}`, { redirect: "manual" });
      expect(res.status, route).toBe(404);
      expect(res.headers.get("location"), route).toBeNull();
    }
  });

  it("answers GET on /rpc with 404 (the endpoint is POST-only)", async () => {
    expect((await fetch(`${baseUrl}/rpc`)).status).toBe(404);
  });

  it("keeps POST /rpc on the same server", async () => {
    const res = await fetch(`${baseUrl}/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "getAvailableModels", params: {}, id: 1 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { jsonrpc?: string; result?: { models: unknown[] } };
    expect(body.jsonrpc).toBe("2.0");
    expect(Array.isArray(body.result?.models)).toBe(true);
  });
});

describe("artifact location from config", () => {
  it("resolves the artifacts root from the injected worker config", async () => {
    const { getArtifactsDir, resolveArtifactsDir } = await import("../../../src/runtime/paths");
    // The process config registered by startHttpTransport points at the sandbox.
    expect(resolveArtifactsDir(ctx.workerConfig)).toBe(rootDir);
    expect(getArtifactsDir()).toBe(rootDir);
    // The test's sandbox lives in the temporary directory, never in the package.
    expect(rootDir.startsWith(path.join(os.tmpdir()))).toBe(true);
  });
});
