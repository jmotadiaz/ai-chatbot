import { readFileSync, existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    // DI por parámetro (ADR 0011 §6): sandbox temporal, sin process.env.
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
    vi.unstubAllGlobals();
    resetGatewayCatalogForTests();
  });

  it("surfaces a newly added model without a worker restart", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ models: CATALOG_A })));

    const before = await getAvailableModels(gateway);
    expect(before.map((m) => m.modelId)).toEqual(["Alpha 1"]);

    // The Gateway publishes a new model: the next getAvailableModels must
    // pick it up with no restart.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ models: CATALOG_B })),
    );
    const after = await getAvailableModels(gateway);
    expect(after.map((m) => m.modelId)).toEqual(["Alpha 1", "Bravo 2"]);

    // models.json was rewritten too (both files-backed catalog and runtime).
    const json = JSON.parse(readFileSync(modelsPath, "utf8"));
    const models = json.providers["model-gateway"].models as Array<{ id: string }>;
    expect(models.map((m) => m.id)).toEqual(["Alpha 1", "Bravo 2"]);
  });

  it("drops a model removed from the Gateway on the next getAvailableModels", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ models: CATALOG_B })));
    const before = await getAvailableModels(gateway);
    expect(before.map((m) => m.modelId)).toEqual(["Alpha 1", "Bravo 2"]);

    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ models: CATALOG_A })));
    const after = await getAvailableModels(gateway);
    expect(after.map((m) => m.modelId)).toEqual(["Alpha 1"]);
  });

  it("keeps the last good catalog when the Gateway is down during a refresh", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ models: CATALOG_A })));
    const before = await getAvailableModels(gateway);
    expect(before.map((m) => m.modelId)).toEqual(["Alpha 1"]);
    const modelsJsonBefore = readFileSync(modelsPath, "utf8");

    // Gateway down mid-life: refresh keeps the last good catalog instead of
    // failing getAvailableModels.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const after = await getAvailableModels(gateway);
    expect(after.map((m) => m.modelId)).toEqual(["Alpha 1"]);
    expect(readFileSync(modelsPath, "utf8")).toBe(modelsJsonBefore);
  });

  it("still fails fast when the Gateway is down on the initial load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    await expect(getAvailableModels(gateway)).rejects.toThrow(/Model Gateway/);
  });

  it("shares a single Gateway fetch between concurrent refreshes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ models: CATALOG_A })));
    // Warm up: cold start performs the initial ensure (one fetch).
    await getAvailableModels(gateway);

    let counted = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        counted += 1;
        return Response.json({ models: CATALOG_B });
      }),
    );
    const [first, second] = await Promise.all([getAvailableModels(gateway), getAvailableModels(gateway)]);
    expect(counted).toBe(1);
    expect(first.map((m) => m.modelId)).toEqual(["Alpha 1", "Bravo 2"]);
    expect(second.map((m) => m.modelId)).toEqual(["Alpha 1", "Bravo 2"]);
  });

  it("never reuses a stale refresh: consecutive calls re-sync", async () => {
    let counted = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        counted += 1;
        return Response.json({ models: CATALOG_A });
      }),
    );
    await getAvailableModels(gateway);
    await getAvailableModels(gateway);
    // cold ensure (1 fetch) + one refresh per call (sequential → 2 fetches).
    expect(counted).toBe(2);
  });

  it("writes models.json on the cold path even when auth.json pre-exists", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ models: CATALOG_A })));
    await getAvailableModels(gateway);
    expect(existsSync(modelsPath)).toBe(true);
    expect(JSON.parse(readFileSync(modelsPath, "utf8")).providers["model-gateway"].models).toEqual(
      buildPiModelsJson(CATALOG_A, GATEWAY_URL).providers["model-gateway"].models,
    );
  });
});
