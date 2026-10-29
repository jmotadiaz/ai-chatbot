import { writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GatewayScenario } from "@ai-chatbot/model-gateway-testing";
import { setupWorkerGatewayHarness } from "../../helpers/gateway-harness";
import {
  buildPiModelsJson,
  resetGatewayCatalogForTests,
  type GatewayModelEntry,
} from "../../../src/runtime/gateway-catalog";
import { resetModelRuntimeForTests } from "../../../src/runtime/model-runtime";
import { createTestWorkerContext } from "../../helpers/test-context";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  acquireTraceSink: async () => null,
  releaseTraceSink: async () => {},
  retainTraceSink: () => async () => {},
  getTraceLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    startTimer: () => () => {},
  }),
}));

const { getAvailableModels } = await import("../../../src/session/session-manager");

const GATEWAY_URL = "http://127.0.0.1:4099";
const GATEWAY_KEY = "test-gateway-key";

const catalog: GatewayModelEntry[] = [
  {
    id: "Muse Spark 1.3",
    company: "meta",
    isDefault: false,
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    cost: { input: 0.1, output: 0.2, cacheRead: 0.002, cacheWrite: 0.002 },
    reasoning: true,
    thinkingLevels: ["low", "medium", "high", "xhigh"],
    defaultThinkingLevel: "high",
    supportedFiles: ["img"],
    supportedOutput: ["text"],
    zeroDataRetention: true,
    temperature: 0.6,
    topP: 0.95,
    topK: null,
  },
  {
    id: "Nemotron 3 Super",
    company: "nvidia",
    isDefault: false,
    contextWindow: 128_000,
    maxTokens: 32_000,
    cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0.2 },
    reasoning: false,
    thinkingLevels: [],
    defaultThinkingLevel: null,
    supportedFiles: [],
    supportedOutput: ["text"],
    zeroDataRetention: false,
    temperature: null,
    topP: null,
    topK: null,
  },
];

let ctx: ReturnType<typeof createTestWorkerContext>;
let gateway: { gatewayUrl: string; apiKey: string; modelsJsonPath: string; authJsonPath: string };
let scenario: GatewayScenario;

/**
 * Catalog served at the Gateway HTTP seam by the official toolkit: the entries
 * (ids, thinking levels, capabilities) stay owned by the Worker; MSW answers the
 * worker's real catalog fetch, so no gateway listens on `GATEWAY_URL`.
 */
const gatewayHarness = setupWorkerGatewayHarness();

beforeEach(() => {
  scenario = gatewayHarness.use({ catalog: { public: catalog } });
  resetModelRuntimeForTests();
  resetGatewayCatalogForTests();
  // DI through parameters (ADR 0011 §6): temporary sandbox + test credentials,
  // no process.env. The suite never touches the prod/dev runtime dirs.
  ctx = createTestWorkerContext({ gatewayUrl: GATEWAY_URL, apiKey: GATEWAY_KEY });
  gateway = {
    gatewayUrl: GATEWAY_URL,
    apiKey: GATEWAY_KEY,
    modelsJsonPath: ctx.modelsJsonPath,
    authJsonPath: ctx.authJsonPath,
  };
  // The models.json is written by the startup sync (ensureGatewayModelsJson,
  // via getModelRuntime), not by the test — but pre-writing it here exercises
  // the same shape buildPiModelsJson emits.
  writeFileSync(
    ctx.modelsJsonPath,
    JSON.stringify(buildPiModelsJson(catalog, GATEWAY_URL), null, 2),
  );
});

afterEach(() => {
  ctx.cleanup();
  resetGatewayCatalogForTests();
});

describe("getAvailableModels", () => {
  it("lists the single model-gateway provider with catalog ids and their thinking levels", async () => {
    // Even if a legacy auth.json holds credentials for Pi's built-in
    // providers (e.g. opencode-go, openrouter), only model-gateway entries
    // may surface.
    writeFileSync(
      ctx.authJsonPath,
      JSON.stringify({ "opencode-go": { type: "api_key", key: "legacy-key" } }),
    );
    const models = await getAvailableModels(gateway);
    // The listing came from the catalog the Gateway actually served.
    expect(scenario.requests.map((r) => r.path)).toEqual(["/v1/models/catalog"]);
    expect(models.map((m) => m.providerId)).toEqual(["model-gateway", "model-gateway"]);
    const muse = models.find((m) => m.modelId === "Muse Spark 1.3");
    expect(muse?.modelId).toBe("Muse Spark 1.3");
    expect(muse?.label).toBe("model-gateway/Muse Spark 1.3");
    // From the synced Gateway catalog ("off" always available), not Pi's
    // thinkingLevelMap.
    expect(muse?.levels).toEqual(["off", "low", "medium", "high", "xhigh"]);
    const nemotron = models.find((m) => m.modelId === "Nemotron 3 Super");
    expect(nemotron?.levels).toEqual(["off"]);
  });

  it("fails fast when the API key is unset instead of starting with an empty catalog", async () => {
    // Explicit DI `apiKey: ""` = no credential: it validates before writing or
    // starting with an empty catalog, without environment variables.
    resetModelRuntimeForTests();
    await expect(
      getAvailableModels({ ...gateway, apiKey: "" }),
    ).rejects.toThrow(/MODEL_GATEWAY_API_KEY/);
  });
});
