import { describe, expect, it, vi } from "vitest";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { ModelId } from "models";
import { createInferenceKit } from "../../src/kit";
import type { InferenceClients } from "../../src/types";

const stubModel = (modelId: string): LanguageModelV3 =>
  ({ modelId, specificationVersion: "v3" }) as unknown as LanguageModelV3;

/** A `clients` registry that never touches a real SDK: every kind returns a stub tagged with the modelId it was called with. */
function stubClients(overrides: Partial<InferenceClients> = {}): InferenceClients {
  const kinds: Array<keyof InferenceClients> = [
    "opencodeGo",
    "opencodeGoResponses",
    "opencodeGoAnthropic",
    "opencodeZen",
    "gateway",
    "openrouter",
    "openai",
    "xai",
    "groq",
    "perplexity",
    "lmstudio",
    "deepinfra",
  ];
  const base = Object.fromEntries(
    kinds.map((kind) => [kind, vi.fn((modelId: string) => stubModel(modelId))]),
  ) as unknown as InferenceClients;
  return { ...base, ...overrides };
}

describe("languageModel: catalog id -> Model Configuration", () => {
  it("builds the configuration from the catalog entry (Muse Spark 1.3)", () => {
    const kit = createInferenceKit({ clients: stubClients() });
    const cfg = kit.languageModel("Muse Spark 1.3" as ModelId);

    expect(cfg.company).toBe("meta");
    expect(cfg.reasoning).toBe(true);
    expect(cfg.temperature).toBe(1);
    expect(cfg.topP).toBe(0.95);
    expect(cfg.topK).toBe(64);
    expect(cfg.supportedFiles).toEqual(["img"]);
    expect(cfg.providerOptions?.openai?.store).toBe(false);
    expect(cfg.model).toBeDefined();
  });

  it("builds the configuration for a gateway-routed model with zero data retention (Deepseek v4.1 Flash)", () => {
    const kit = createInferenceKit({ clients: stubClients() });
    const cfg = kit.languageModel("Deepseek v4.1 Flash" as ModelId);

    expect(cfg.company).toBe("deepseek");
    expect(cfg.temperature).toBe(1);
    expect(cfg.topP).toBe(0.95);
    expect(cfg.contextWindow).toBe(1_000_000);
    expect((cfg.providerOptions?.gateway as any)?.zeroDataRetention).toBe(true);
  });

  it("merges a providerOptions override with the catalog's own providerOptions (deepmerge, not replace)", () => {
    const kit = createInferenceKit({ clients: stubClients() });
    const cfg = kit.languageModel("Deepseek v4.1 Flash" as ModelId, {
      providerOptions: { openai: { store: false } },
    });

    expect((cfg.providerOptions?.gateway as any)?.zeroDataRetention).toBe(true);
    expect(cfg.providerOptions?.openai?.store).toBe(false);
  });

  it("assigns a providerOptions override wholesale when the catalog entry has none", () => {
    const kit = createInferenceKit({ clients: stubClients() });
    // Kimi K3 has no providerOptions in the catalog.
    const cfg = kit.languageModel("Kimi K3" as ModelId, {
      providerOptions: { openai: { store: false } },
    });

    expect(cfg.providerOptions?.openai?.store).toBe(false);
  });

  it("wraps the model with the reasoning middleware only when the catalog entry asks for it", () => {
    const perplexity = vi.fn((modelId: string) => stubModel(modelId));
    const kit = createInferenceKit({ clients: stubClients({ perplexity }) });

    // Sonar Reasoning sets wrapWithReasoningMiddleware; Sonar Pro (same kind) does not.
    const wrapped = kit.languageModel("Sonar Reasoning" as ModelId);
    const plain = kit.languageModel("Sonar Pro" as ModelId);

    expect(perplexity).toHaveBeenCalledTimes(2);
    expect(wrapped.model).not.toBe(perplexity.mock.results[0]?.value);
    expect(plain.model).toBe(perplexity.mock.results[1]?.value);
  });

  it("memoizes: a single client construction per id, same model reference on every call", () => {
    const opencodeGo = vi.fn((modelId: string) => stubModel(modelId));
    const kit = createInferenceKit({ clients: stubClients({ opencodeGo }) });

    const first = kit.languageModel("Kimi K3" as ModelId);
    const second = kit.languageModel("Kimi K3" as ModelId);
    const third = kit.languageModel("Kimi K3" as ModelId, {
      providerOptions: { openai: { store: false } },
    });

    expect(opencodeGo).toHaveBeenCalledTimes(1);
    expect(first.model).toBe(second.model);
    expect(third.model).toBe(first.model);
  });

  it("does not share memoization across independent kit instances", () => {
    const kitA = createInferenceKit({ clients: stubClients() });
    const kitB = createInferenceKit({ clients: stubClients() });

    expect(kitA.languageModel("Kimi K3" as ModelId).model).not.toBe(
      kitB.languageModel("Kimi K3" as ModelId).model,
    );
  });

  it("lets a languageModel override substitute the model for a specific catalog entry", () => {
    const override = stubModel("substituted");
    const opencodeGo = vi.fn((modelId: string) => stubModel(modelId));
    const kit = createInferenceKit({
      clients: stubClients({ opencodeGo }),
      languageModel: (entry) => (entry.id === "Kimi K3" ? override : undefined),
    });

    expect(kit.languageModel("Kimi K3" as ModelId).model).toBe(override);
    // Falls back to `clients` for any entry the override does not claim.
    expect(kit.languageModel("Kimi K2.7 Code" as ModelId).model).toBeDefined();
    expect(opencodeGo).toHaveBeenCalledWith("kimi-k2.7-code");
    expect(opencodeGo).not.toHaveBeenCalledWith("kimi-k3");
  });

  it("throws for an id absent from the catalog", () => {
    const kit = createInferenceKit({ clients: stubClients() });
    expect(() => kit.languageModel("not-a-real-model" as ModelId)).toThrow();
  });
});
