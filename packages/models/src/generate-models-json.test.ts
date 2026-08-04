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
const builtIns = new Map<string, PiModelBaseline>(
  MODEL_CATALOG.filter((e) => e.userInvocable).map((e) => [
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
    expect(models).toHaveLength(INVOCABLE_MODEL_IDS.length);
    expect(models.map((m) => m.name)).toEqual([...INVOCABLE_MODEL_IDS]);
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
