import { describe, expect, it } from "vitest";
import {
  generateModelsJson,
  type PiModelBaseline,
} from "./generate-models-json";
import {
  INVOCABLE_MODEL_IDS,
  MODEL_CATALOG,
  type ModelCatalogEntry,
} from "./catalog";

const COST = { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0.2 };

/** Stand-in for what Pi reports about the models it already ships. */
const NOT_BUILT_IN = new Set([
  "kimi-k3",
  "qwen3.8-max",
  "glm-5.2",
  "glm-5.3-flash",
  "muse-spark-1.2-contributor",
]);

/** Stand-in for what Pi reports about the models it already ships. */
const builtIns = new Map<string, PiModelBaseline>(
  // Pi only ships standard opencode-go models; models not in Pi's built-ins
  // (e.g. Kimi K3, Qwen 3.8 Max, Muse Spark) have no baseline and must be described by the catalog.
  MODEL_CATALOG.filter(
    (e) =>
      e.userInvocable &&
      e.provider.kind === "opencodeGo" &&
      !NOT_BUILT_IN.has(e.provider.modelId),
  ).map((e) => [
    e.provider.modelId,
    {
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 1_000_000,
      maxTokens: 384_000,
      cost: COST,
      // Mirrors Pi's built-ins: anthropic-messages endpoints differ from the
      // provider's openai-completions default (deepseek-v4-flash).
      ...(e.provider.modelId === "minimax-m3"
        ? { api: "anthropic-messages", baseUrl: "https://opencode.ai/zen/go" }
        : {}),
    },
  ]),
);

const generate = (catalog?: readonly ModelCatalogEntry[]) =>
  generateModelsJson(catalog, { builtIns });

describe("generateModelsJson", () => {
  const models = generate().providers["opencode-go"].models;

  it("emits one Pi model per invocable catalog entry", () => {
    // Models are grouped per provider, so count across all of them.
    const allModels = Object.values(generate().providers).flatMap(
      (p) => p.models,
    );
    expect(allModels).toHaveLength(INVOCABLE_MODEL_IDS.length);
    // Models are grouped by provider (opencode-go first, then gateway/openrouter),
    // so the order differs from INVOCABLE_MODEL_IDS (catalog order).
    expect(new Set(allModels.map((m) => m.name))).toEqual(new Set(INVOCABLE_MODEL_IDS));
  });

  it("uses the provider modelId as Pi id", () => {
    expect(models.find((m) => m.name === "Deepseek v4 Pro")?.id).toBe(
      "deepseek-v4-pro",
    );
  });

  it("inherits Pi's limits and cost instead of falling back to its defaults", () => {
    const pro = models.find((m) => m.name === "Deepseek v4 Pro");
    expect(pro?.contextWindow).toBe(1_000_000);
    expect(pro?.maxTokens).toBe(384_000);
    expect(pro?.cost).toEqual(COST);
  });

  it("lets the catalog override what it declares", () => {
    const entry: ModelCatalogEntry = {
      id: "Deepseek v4 Pro",
      userInvocable: true,
      provider: { kind: "opencodeGo", modelId: "deepseek-v4-pro" },
      company: "deepseek",
      contextWindow: 64_000,
      supportedFiles: ["pdf"],
    };
    const [model] = generate([entry]).providers["opencode-go"].models;
    expect(model.contextWindow).toBe(64_000);
    // Not declared by the catalog, so still inherited.
    expect(model.maxTokens).toBe(384_000);
    // Declared without "img", so it narrows Pi's baseline.
    expect(model.input).toEqual(["text"]);
  });

  it("inherits Pi's input when the catalog declares no supportedFiles", () => {
    expect(models.find((m) => m.name === "Deepseek v4 Pro")?.input).toEqual([
      "text",
      "image",
    ]);
  });

  it("derives image input from supportedFiles", () => {
    expect(models.find((m) => m.name === "Kimi K2.7 Code")?.input).toEqual([
      "text",
      "image",
    ]);
    expect(models.find((m) => m.name === "Qwen 3.7 Plus")?.input).toEqual([
      "text",
      "image",
    ]);
  });

  it("uses the catalog's own limits for a model Pi does not ship", () => {
    // Kimi K3 is not a Pi built-in, so it must survive an empty baseline map.
    const entry = MODEL_CATALOG.find((e) => e.id === "Kimi K3")!;
    const [k3] = generateModelsJson([entry], { builtIns: new Map() })
      .providers["opencode-go"].models;
    expect(k3.contextWindow).toBe(1_048_576);
    expect(k3.maxTokens).toBe(131_072);
    expect(k3.cost).toEqual({
      input: 3,
      output: 15,
      cacheRead: 0.3,
      cacheWrite: 0,
    });
  });

  it("describes Qwen 3.8 Max, which Pi does not ship yet", () => {
    const entry = MODEL_CATALOG.find((e) => e.id === "Qwen 3.8 Max")!;
    const [max] = generateModelsJson([entry], { builtIns: new Map() })
      .providers["opencode-go"].models;
    expect(max.id).toBe("qwen3.8-max");
    expect(max.contextWindow).toBe(1_000_000);
    expect(max.maxTokens).toBe(65_536);
    expect(max.cost).toEqual({
      input: 2.5,
      output: 7.5,
      cacheRead: 0.5,
      cacheWrite: 3.125,
    });
    expect(max.reasoning).toBe(true);
  });

  it("describes GLM 5.2, which Pi does not ship yet on opencode-go", () => {
    const entry = MODEL_CATALOG.find((e) => e.id === "GLM 5.2")!;
    const [glm] = generateModelsJson([entry], { builtIns: new Map() })
      .providers["opencode-go"].models;
    expect(glm.id).toBe("glm-5.2");
    expect(glm.contextWindow).toBe(1_000_000);
    expect(glm.maxTokens).toBe(128_000);
    expect(glm.cost).toEqual({
      input: 1.4,
      output: 4.4,
      cacheRead: 0.26,
      cacheWrite: 0,
    });
    expect(glm.reasoning).toBe(true);
  });

  it("describes Hy3, which Pi does not ship yet on opencode-go", () => {
    const entry = MODEL_CATALOG.find((e) => e.id === "Hy3")!;
    const [hy3] = generateModelsJson([entry], { builtIns: new Map() })
      .providers["opencode-go"].models;
    expect(hy3.id).toBe("hy3");
    expect(hy3.contextWindow).toBe(262_144);
    expect(hy3.maxTokens).toBe(128_000);
    expect(hy3.cost).toEqual({
      input: 0.14,
      output: 0.58,
      cacheRead: 0.038,
      cacheWrite: 0,
    });
    expect(hy3.reasoning).toBe(true);
    expect(hy3.thinkingLevelMap).toEqual({
      off: "no_think",
      minimal: null,
      low: "low",
      medium: null,
      high: "high",
    });
  });

  it("throws for a model Pi does not know and the catalog does not describe", () => {
    const entry: ModelCatalogEntry = {
      id: "Brand New Model",
      userInvocable: true,
      provider: { kind: "opencodeGo", modelId: "brand-new-model" },
      company: "deepseek",
    };
    expect(() => generate([entry])).toThrow(
      /Brand New Model.*contextWindow, maxTokens, cost/s,
    );
  });

  it("inherits Pi's api and baseUrl from the baseline so routing is preserved", () => {
    const miniMax = generate().providers["opencode-go"].models.find(
      (m) => m.name === "MiniMax M3",
    );
    // The generated models.json must pin the built-in endpoint; otherwise
    // pi's ModelRegistry fills api/baseUrl from the provider's first built-in
    // model (deepseek-v4-flash, openai-completions) and minimax's
    // anthropic-messages endpoint is silently rewritten — its thinking then
    // arrives inline as <think> text and renders as a plain model response.
    expect(miniMax?.api).toBe("anthropic-messages");
    expect(miniMax?.baseUrl).toBe("https://opencode.ai/zen/go");
  });

  it("inherits Pi's thinkingLevelMap from the built-in baseline", () => {
    // Without this, deepseek's built-in thinkingLevelMap ({xhigh: "max"}) is
    // lost because pi's ModelRegistry replaces the built-in wholesale with the
    // models.json entry, and getSupportedThinkingLevels then caps at "high".
    const withMap = new Map(builtIns).set("deepseek-v4-pro", {
      ...builtIns.get("deepseek-v4-pro")!,
      thinkingLevelMap: {
        minimal: null,
        low: null,
        medium: null,
        high: "high",
        xhigh: "max",
      },
    });
    const pro = generateModelsJson(undefined, { builtIns: withMap })
      .providers["opencode-go"].models.find((m) => m.id === "deepseek-v4-pro");
    expect(pro?.thinkingLevelMap).toEqual({
      minimal: null,
      low: null,
      medium: null,
      high: "high",
      xhigh: "max",
    });
  });

  it("lets the catalog override the inherited thinkingLevelMap", () => {
    const entry: ModelCatalogEntry = {
      id: "Deepseek v4 Pro",
      userInvocable: true,
      provider: { kind: "opencodeGo", modelId: "deepseek-v4-pro" },
      company: "deepseek",
      reasoning: true,
      thinkingLevelMap: { high: "high", xhigh: null },
    };
    const withMap = new Map(builtIns).set("deepseek-v4-pro", {
      ...builtIns.get("deepseek-v4-pro")!,
      thinkingLevelMap: {
        minimal: null,
        low: null,
        medium: null,
        high: "high",
        xhigh: "max",
      },
    });
    const [model] = generateModelsJson([entry], { builtIns: withMap })
      .providers["opencode-go"].models;
    expect(model.thinkingLevelMap).toEqual({ high: "high", xhigh: null });
  });

  it("accepts a model Pi does not know when the catalog describes it fully", () => {
    const entry: ModelCatalogEntry = {
      id: "Brand New Model",
      userInvocable: true,
      provider: { kind: "opencodeGo", modelId: "brand-new-model" },
      company: "deepseek",
      contextWindow: 32_000,
      maxTokens: 8_000,
      cost: COST,
    };
    const [model] = generate([entry]).providers["opencode-go"].models;
    expect(model).toEqual({
      id: "brand-new-model",
      name: "Brand New Model",
      reasoning: false,
      input: ["text"],
      contextWindow: 32_000,
      maxTokens: 8_000,
      cost: COST,
    });
  });
});

describe("generateModelsJson custom providers", () => {
  it("emits the vercel-ai-gateway provider with models only (built-in in Pi)", () => {
    const providers = generate().providers;
    expect(providers["vercel-ai-gateway"]).toBeDefined();
    // Pi conoce el provider (baseUrl/api/apiKey heredados de sus built-ins;
    // el apiKey llega vía env AI_GATEWAY_API_KEY), así que no se emite config.
    expect(providers["vercel-ai-gateway"].baseUrl).toBeUndefined();
    expect(providers["vercel-ai-gateway"].api).toBeUndefined();
    expect(providers["vercel-ai-gateway"].apiKey).toBeUndefined();
  });

  it("describes the Muse Spark model fully", () => {
    const muse = generate().providers["opencode-go"].models.find(
      (m) => m.name === "Muse Spark 1.2",
    );
    expect(muse).toEqual({
      id: "muse-spark-1.2-contributor",
      name: "Muse Spark 1.2",
      api: "openai-responses",
      reasoning: true,
      input: ["text", "image"],
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
    });
  });

  it("describes GLM 5.3 Flash on opencode-go, deriving image input from its supportedFiles", () => {
    const flash = generate().providers["opencode-go"].models.find(
      (m) => m.name === "GLM 5.3 Flash",
    );
    expect(flash?.id).toBe("glm-5.3-flash");
    expect(flash?.input).toEqual(["text", "image"]);
    expect(flash?.reasoning).toBe(true);
    expect(flash?.thinkingLevelMap).toEqual({
      off: null,
      minimal: null,
      low: "low",
      medium: null,
      high: "high",
      xhigh: "max",
    });
  });

  it("describes Gemini 3.7 Flash, which Pi does not ship on vercel-ai-gateway", () => {
    const entry = MODEL_CATALOG.find((e) => e.id === "Gemini 3.7 Flash")!;
    const [flash] = generateModelsJson([entry], { builtIns: new Map() })
      .providers["vercel-ai-gateway"].models;
    expect(flash).toEqual({
      id: "google/gemini-3.7-flash",
      name: "Gemini 3.7 Flash",
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 1_048_576,
      maxTokens: 65_536,
      cost: { input: 0.375, output: 1.875, cacheRead: 0.0375, cacheWrite: 0.020833 },
      // Reasoning es obligatorio y el provider solo soporta low/medium/high.
      thinkingLevelMap: {
        off: null,
        minimal: null,
        low: "low",
        medium: "medium",
        high: "high",
      },
    });
  });

  it("describes GLM 5.3 on vercel-ai-gateway fully", () => {
    const entry = MODEL_CATALOG.find((e) => e.id === "GLM 5.3")!;
    const [glm] = generateModelsJson([entry], { builtIns: new Map() })
      .providers["vercel-ai-gateway"].models;
    expect(glm).toEqual({
      id: "zai/glm-5.3",
      name: "GLM 5.3",
      reasoning: true,
      input: ["text"],
      contextWindow: 1_000_000,
      maxTokens: 12_800,
      cost: { input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 0 },
      thinkingLevelMap: {
        off: null,
        minimal: "minimal",
        low: "low",
        medium: "medium",
        high: "high",
        xhigh: "xhigh",
      },
    });
  });

  it("keeps the opencode-go provider shape (models only, no provider config)", () => {
    const providers = generate().providers;
    expect(providers["opencode-go"].baseUrl).toBeUndefined();
    expect(providers["opencode-go"].api).toBeUndefined();
    expect(providers["opencode-go"].apiKey).toBeUndefined();
    expect(providers["opencode-go"].models.length).toBeGreaterThan(0);
  });
});

describe("generateModelsJson opencode zen (free) model", () => {
  it("emits deepseek-v4-flash-free under the built-in opencode provider, fully self-described", () => {
    // Pi trae el modelo built-in (provider "opencode"), pero los baselines
    // solo cubren opencode-go: la entrada se auto-describe y sobrevive con
    // builtIns vacías.
    const entry = MODEL_CATALOG.find((e) => e.id === "Deepseek v4 Flash (free)")!;
    const [model] = generateModelsJson([entry], { builtIns: new Map() })
      .providers["opencode"].models;
    expect(model).toEqual({
      id: "deepseek-v4-flash-free",
      name: "Deepseek v4 Flash (free)",
      reasoning: true,
      input: ["text"],
      contextWindow: 200_000,
      maxTokens: 128_000,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      thinkingLevelMap: {
        minimal: null,
        low: null,
        medium: null,
        high: "high",
        xhigh: "max",
      },
    });
  });
});
