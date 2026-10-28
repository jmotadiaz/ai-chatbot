import { readFileSync, existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupWorkerGatewayHarness } from "../helpers/gateway-harness";

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

const { getAvailableModels } = await import("../../src/session/session-manager");
const { resetModelRuntimeForTests } = await import("../../src/runtime/model-runtime");
const { resetGatewayCatalogForTests, buildPiModelsJson } = await import(
  "../../src/runtime/gateway-catalog"
);
import type { GatewayModelEntry } from "../../src/runtime/gateway-catalog";
import { createTestWorkerContext } from "../helpers/test-context";

const GATEWAY_URL = "http://127.0.0.1:4098";
const GATEWAY_KEY = "gw-secret-refresh";

function entry(id: string): GatewayModelEntry {
  return {
    id,
    company: "acme",
    isDefault: false,
    contextWindow: 128_000,
    maxTokens: 32_768,
    cost: { input: 0.5, output: 1.5, cacheRead: 0.1, cacheWrite: 0.1 },
    reasoning: false,
    thinkingLevels: [],
    defaultThinkingLevel: null,
    supportedFiles: [],
    supportedOutput: ["text"],
    zeroDataRetention: false,
    temperature: null,
    topP: null,
    topK: null,
  };
}

const CATALOG_A: GatewayModelEntry[] = [entry("Alpha 1")];
const CATALOG_B: GatewayModelEntry[] = [entry("Alpha 1"), entry("Bravo 2")];

/**
 * Catalog hot reload (ADR 0010) driven through the official toolkit: the Worker
 * keeps fetching the real `GET /v1/models/catalog` over `fetch`, and MSW answers
 * it from a scenario the test controls.
 *
 * A "phase" is one `gateway.use({...})` call: a fresh scenario instance with its
 * own catalog and its own recorded requests. Publishing a model, removing it or
 * taking the Gateway down is therefore a local, per-test change of phase — no
 * re-stubbed global `fetch`, no shared counter or queue, and the number of
 * requests a phase answered is exactly `phase.requests.length`.
 */
const gatewayHarness = setupWorkerGatewayHarness();

describe("getAvailableModels refreshes the Model Catalog", () => {
  let ctx: ReturnType<typeof createTestWorkerContext>;
  let modelsPath: string;
  let gateway: {
    gatewayUrl: string;
    apiKey: string;
    modelsJsonPath: string;
    authJsonPath: string;
  };

  beforeEach(() => {
    resetModelRuntimeForTests();
    resetGatewayCatalogForTests();
    // DI through parameters (ADR 0011 §6): temporary sandbox, no process.env.
    ctx = createTestWorkerContext({ gatewayUrl: GATEWAY_URL, apiKey: GATEWAY_KEY });
    modelsPath = ctx.modelsJsonPath;
    gateway = {
      gatewayUrl: GATEWAY_URL,
      apiKey: GATEWAY_KEY,
      modelsJsonPath: ctx.modelsJsonPath,
      authJsonPath: ctx.authJsonPath,
    };
  });

  afterEach(() => {
    ctx.cleanup();
    resetGatewayCatalogForTests();
  });

  it("surfaces a newly added model without a worker restart", async () => {
    const phaseA = gatewayHarness.use({ catalog: { public: CATALOG_A } });

    const before = await getAvailableModels(gateway);
    expect(before.map((m) => m.modelId)).toEqual(["Alpha 1"]);
    expect(phaseA.requests.map((r) => r.path)).toEqual(["/v1/models/catalog"]);

    // The Gateway publishes a new model: the next getAvailableModels must
    // pick it up with no restart.
    const phaseB = gatewayHarness.use({ catalog: { public: CATALOG_B } });
    const after = await getAvailableModels(gateway);
    expect(after.map((m) => m.modelId)).toEqual(["Alpha 1", "Bravo 2"]);
    expect(phaseB.requests.map((r) => r.path)).toEqual(["/v1/models/catalog"]);

    // models.json was rewritten too (both files-backed catalog and runtime).
    const json = JSON.parse(readFileSync(modelsPath, "utf8"));
    const models = json.providers["model-gateway"].models as Array<{ id: string }>;
    expect(models.map((m) => m.id)).toEqual(["Alpha 1", "Bravo 2"]);
  });

  it("drops a model removed from the Gateway on the next getAvailableModels", async () => {
    gatewayHarness.use({ catalog: { public: CATALOG_B } });
    const before = await getAvailableModels(gateway);
    expect(before.map((m) => m.modelId)).toEqual(["Alpha 1", "Bravo 2"]);

    gatewayHarness.use({ catalog: { public: CATALOG_A } });
    const after = await getAvailableModels(gateway);
    expect(after.map((m) => m.modelId)).toEqual(["Alpha 1"]);
  });

  it("keeps the last good catalog when the Gateway is down during a refresh", async () => {
    gatewayHarness.use({ catalog: { public: CATALOG_A } });
    const before = await getAvailableModels(gateway);
    expect(before.map((m) => m.modelId)).toEqual(["Alpha 1"]);
    const modelsJsonBefore = readFileSync(modelsPath, "utf8");

    // Gateway down mid-life: refresh keeps the last good catalog instead of
    // failing getAvailableModels.
    gatewayHarness.failTransport();
    const after = await getAvailableModels(gateway);
    expect(after.map((m) => m.modelId)).toEqual(["Alpha 1"]);
    expect(readFileSync(modelsPath, "utf8")).toBe(modelsJsonBefore);
  });

  it("still fails fast when the Gateway is down on the initial load", async () => {
    gatewayHarness.failTransport();

    await expect(getAvailableModels(gateway)).rejects.toThrow(/Model Gateway/);
  });

  it("shares a single Gateway fetch between concurrent refreshes", async () => {
    // Warm up: cold start performs the initial ensure (one fetch).
    gatewayHarness.use({ catalog: { public: CATALOG_A } });
    await getAvailableModels(gateway);

    // New phase: the refresh under test can only be answered by this scenario,
    // so its recorded requests are the exact request count of the deduplicated
    // refresh.
    const phase = gatewayHarness.use({ catalog: { public: CATALOG_B } });
    const [first, second] = await Promise.all([
      getAvailableModels(gateway),
      getAvailableModels(gateway),
    ]);
    expect(phase.requests).toHaveLength(1);
    expect(first.map((m) => m.modelId)).toEqual(["Alpha 1", "Bravo 2"]);
    expect(second.map((m) => m.modelId)).toEqual(["Alpha 1", "Bravo 2"]);
  });

  it("never reuses a stale refresh: consecutive calls re-sync", async () => {
    const phase = gatewayHarness.use({ catalog: { public: CATALOG_A } });

    await getAvailableModels(gateway);
    await getAvailableModels(gateway);
    // cold ensure (1 fetch) + one refresh per call (sequential → 2 fetches).
    expect(phase.requests).toHaveLength(2);
  });

  it("writes models.json on the cold path even when auth.json pre-exists", async () => {
    gatewayHarness.use({ catalog: { public: CATALOG_A } });
    await getAvailableModels(gateway);
    expect(existsSync(modelsPath)).toBe(true);
    expect(JSON.parse(readFileSync(modelsPath, "utf8")).providers["model-gateway"].models).toEqual(
      buildPiModelsJson(CATALOG_A, GATEWAY_URL).providers["model-gateway"].models,
    );
  });
});
