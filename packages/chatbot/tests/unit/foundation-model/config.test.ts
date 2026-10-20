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
// La fixture del catálogo es el catálogo que sirve el Mock Model Gateway
// (ticket 02): mismos ids que los e2e usan directamente.
import { TEST_MODELS, TEST_INTERNAL_MODELS } from "@/tests/mocks/gateway/catalog";

const catalog = [...TEST_MODELS, ...TEST_INTERNAL_MODELS];

describe("chatModelKeys / defaultModel sobre el catálogo del Gateway", () => {
  it("expone los modelos user-invocable y excluye los contratos *-default", () => {
    const keys = chatModelKeys(catalog);

    expect(keys).toEqual(TEST_MODELS.map((m) => m.id));
    for (const contract of DEFAULT_MODEL_CONTRACTS) {
      expect(keys).not.toContain(contract);
    }
  });

  it("el default es la entrada isDefault del catálogo", () => {
    expect(defaultModel(catalog)).toBe("basicChat");
  });
});

describe("getChatConfigurationByModelId", () => {
  it("construye la configuración desde la entrada del catálogo", () => {
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

  it("expone capacidades por modelo (archivos, reasoning, thinking)", () => {
    const images = getChatConfigurationByModelId(catalog, "canSeeImages");
    expect(images.supportedFiles).toEqual(["img"]);

    const reasoning = getChatConfigurationByModelId(catalog, "canProduceReasoning");
    expect(reasoning.reasoning).toBe(true);

    expect(getDefaultThinkingLevel(catalog, "canProduceReasoning")).toBe("medium");
    expect(getDefaultThinkingLevel(catalog, "basicChat")).toBeUndefined();
  });

  it("lanza para un id que no está en el catálogo", () => {
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

describe("thinking levels / validación runtime", () => {
  it("isThinkingLevel valida el vocabulario de ThinkingLevel", () => {
    expect(isThinkingLevel("medium")).toBe(true);
    expect(isThinkingLevel("extreme")).toBe(false);
    expect(isThinkingLevel(42)).toBe(false);
  });

  it("isKnownModelId reconoce ids del catálogo y rechaza desconocidos", () => {
    expect(isKnownModelId(catalog, "basicChat")).toBe(true);
    expect(isKnownModelId(catalog, "decision-default")).toBe(true);
    expect(isKnownModelId(catalog, "no-existe")).toBe(false);
    expect(isKnownModelId(catalog, null)).toBe(false);
  });
});
