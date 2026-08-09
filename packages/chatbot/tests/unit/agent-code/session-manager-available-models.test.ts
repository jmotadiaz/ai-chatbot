import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateModelsJson, type ModelCatalogEntry } from "models";

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

const { getAvailableModels } = await import("coding-agent/session-manager");

const COST = { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0.2 };
const catalog: ModelCatalogEntry[] = [
  {
    id: "Muse Spark 1.2",
    userInvocable: true,
    provider: { kind: "metaModelApi", modelId: "muse-spark-1.2-contributor" },
    company: "meta",
    reasoning: true,
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    cost: { input: 0.1, output: 0.2, cacheRead: 0.002, cacheWrite: 0.002 },
    thinkingLevelMap: {
      off: null,
      minimal: "minimal",
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
    },
  },
  {
    id: "Deepseek v4 Pro",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "deepseek-v4-pro" },
    company: "deepseek",
    reasoning: true,
    contextWindow: 128_000,
    maxTokens: 32_000,
    cost: COST,
  },
];

let tmp: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "available-models-"));
  savedEnv.CODING_AGENT_MODELS_JSON = process.env.CODING_AGENT_MODELS_JSON;
  savedEnv.CODING_AGENT_AUTH_JSON = process.env.CODING_AGENT_AUTH_JSON;
  savedEnv.META_API_KEY = process.env.META_API_KEY;
  process.env.CODING_AGENT_MODELS_JSON = path.join(tmp, "models.json");
  process.env.CODING_AGENT_AUTH_JSON = path.join(tmp, "auth.json");
  process.env.META_API_KEY = "test-key";
  writeFileSync(
    process.env.CODING_AGENT_MODELS_JSON,
    JSON.stringify(generateModelsJson(catalog), null, 2),
  );
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("getAvailableModels", () => {
  it("includes custom providers from models.json (meta) with their thinking levels", async () => {
    const models = await getAvailableModels();
    const muse = models.find(
      (m) => m.providerId === "meta" && m.modelId === "muse-spark-1.2-contributor",
    );
    expect(muse).toBeDefined();
    expect(muse?.label).toBe("meta/muse-spark-1.2-contributor");
    expect(muse?.levels).toEqual(["minimal", "low", "medium", "high", "xhigh"]);
  });

  it("hides the meta model when META_API_KEY is not configured", async () => {
    delete process.env.META_API_KEY;
    const models = await getAvailableModels();
    expect(
      models.find((m) => m.providerId === "meta"),
    ).toBeUndefined();
  });
});
