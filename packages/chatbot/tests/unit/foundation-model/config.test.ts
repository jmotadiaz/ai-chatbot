import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODEL_CONTRACTS,
  chatModelKeys,
  defaultModel,
  getDefaultThinkingLevel,
  getChatConfigurationByModelId,
  isKnownModelId,
  isThinkingLevel,
  resolveChatModelId,
} from "@/lib/features/foundation-model/config";
// The catalog fixture is the catalog the Mock Model Gateway serves (ticket 02):
// the same ids the e2e use directly.
import { TEST_MODELS, TEST_INTERNAL_MODELS } from "@/tests/mocks/gateway/catalog";

const catalog = [...TEST_MODELS, ...TEST_INTERNAL_MODELS];

describe("chatModelKeys / defaultModel over the Gateway catalog", () => {
  it("exposes the user-invocable models and excludes the *-default contracts", () => {
    const keys = chatModelKeys(catalog);

    expect(keys).toEqual(TEST_MODELS.map((m) => m.id));
    for (const contract of DEFAULT_MODEL_CONTRACTS) {
      expect(keys).not.toContain(contract);
    }
  });

  it("the default is the catalog's isDefault entry", () => {
    expect(defaultModel(catalog)).toBe("basicChat");
  });
});

describe("getChatConfigurationByModelId", () => {
  it("builds the configuration from the catalog entry", () => {
    const cfg = getChatConfigurationByModelId(catalog, "basicChat");
    expect(cfg).toEqual({
      company: "mock",
      temperature: 0.6,
      topP: undefined,
      topK: undefined,
      contextWindow: 128000,
      reasoning: false,
      zeroDataRetention: true,
      supportedFiles: [],
      supportedOutput: ["text"],
    });
  });

  it("exposes capabilities per model (files, reasoning, thinking)", () => {
    const images = getChatConfigurationByModelId(catalog, "canSeeImages");
    expect(images.supportedFiles).toEqual(["img"]);

    const reasoning = getChatConfigurationByModelId(catalog, "canProduceReasoning");
    expect(reasoning.reasoning).toBe(true);

    expect(getDefaultThinkingLevel(catalog, "canProduceReasoning")).toBe("medium");
    expect(getDefaultThinkingLevel(catalog, "basicChat")).toBeUndefined();
  });

  it("throws for an id that is not in the catalog", () => {
    expect(() => getChatConfigurationByModelId(catalog, "Retired Model 0.9"))
      .toThrowError(/Retired Model 0.9/);
  });
});

describe("resolveChatModelId", () => {
  const selectable = chatModelKeys(catalog).at(-1)!;

  it("keeps a model id that is still selectable", () => {
    expect(selectable).not.toBe(defaultModel(catalog));

    expect(resolveChatModelId(catalog, selectable)).toBe(selectable);
  });

  it.each([
    ["a NULL column", null],
    ["a missing value", undefined],
    ["an id retired from the catalog", "Retired Model 0.9"],
  ])("falls back to the default model for %s", (_, persisted) => {
    expect(resolveChatModelId(catalog, persisted)).toBe(defaultModel(catalog));
  });
});

describe("thinking levels / runtime validation", () => {
  it("isThinkingLevel validates the ThinkingLevel vocabulary", () => {
    expect(isThinkingLevel("medium")).toBe(true);
    expect(isThinkingLevel("extreme")).toBe(false);
    expect(isThinkingLevel(42)).toBe(false);
  });

  it("isKnownModelId recognizes catalog ids and rejects unknown ones", () => {
    expect(isKnownModelId(catalog, "basicChat")).toBe(true);
    expect(isKnownModelId(catalog, "decision-default")).toBe(true);
    expect(isKnownModelId(catalog, "does-not-exist")).toBe(false);
    expect(isKnownModelId(catalog, null)).toBe(false);
  });
});
