import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPiModelsJson,
  resetGatewayCatalogForTests,
  type GatewayModelEntry,
} from "../../src/runtime/gateway-catalog";
import { resetModelRuntimeForTests } from "../../src/runtime/model-runtime";

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

const { getAvailableModels } = await import("../../src/session/session-manager");

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

let tmp: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ models: catalog }),
    ),
  );
  resetModelRuntimeForTests();
  resetGatewayCatalogForTests();
  tmp = mkdtempSync(path.join(tmpdir(), "available-models-"));
  for (const key of [
    "CODING_AGENT_MODELS_JSON",
    "CODING_AGENT_AUTH_JSON",
    "MODEL_GATEWAY_URL",
    "MODEL_GATEWAY_API_KEY",
  ]) {
    savedEnv[key] = process.env[key];
  }
  process.env.CODING_AGENT_MODELS_JSON = path.join(tmp, "models.json");
  process.env.CODING_AGENT_AUTH_JSON = path.join(tmp, "auth.json");
  process.env.MODEL_GATEWAY_URL = GATEWAY_URL;
  process.env.MODEL_GATEWAY_API_KEY = GATEWAY_KEY;
  // The models.json is written by the startup sync (ensureGatewayModelsJson,
  // via getModelRuntime), not by the test — but pre-writing it here exercises
  // the same shape buildPiModelsJson emits.
  writeFileSync(
    process.env.CODING_AGENT_MODELS_JSON,
    JSON.stringify(buildPiModelsJson(catalog, GATEWAY_URL), null, 2),
  );
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  vi.unstubAllGlobals();
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetGatewayCatalogForTests();
});

describe("getAvailableModels", () => {
  it("lists the single model-gateway provider with catalog ids and their thinking levels", async () => {
    // Even if auth.json or process.env holds legacy credentials for Pi's
    // built-in providers (e.g. opencode-go, openrouter), only model-gateway
    // entries may surface.
    writeFileSync(
      process.env.CODING_AGENT_AUTH_JSON!,
      JSON.stringify({ "opencode-go": { type: "api_key", key: "legacy-key" } }),
    );
    const models = await getAvailableModels();
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

  it("fails fast when MODEL_GATEWAY_API_KEY is unset instead of starting with an empty catalog", async () => {
    delete process.env.MODEL_GATEWAY_API_KEY;
    resetModelRuntimeForTests();
    await expect(getAvailableModels()).rejects.toThrow(/MODEL_GATEWAY_API_KEY/);
  });
});
