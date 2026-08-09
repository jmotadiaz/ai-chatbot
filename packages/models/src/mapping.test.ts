import { describe, expect, it } from "vitest";
import {
  CUSTOM_PI_PROVIDERS,
  filterAvailableChatModels,
  PI_PROVIDER,
  toChatModelId,
  toPiModelId,
  toPiProviderId,
} from "./mapping";
import type { InvocableModelId } from "./catalog";

/** The type rules these ids out; the runtime guard is what's under test. */
const asInvocable = (id: string) => id as InvocableModelId;

describe("model mapping", () => {
  it("maps an invocable model id to its Pi model", () => {
    expect(toPiModelId("Deepseek v4 Pro")).toEqual({
      providerId: "opencode-go",
      modelId: "deepseek-v4-pro",
    });
  });

  it("throws for a non-invocable catalog model", () => {
    expect(() => toPiModelId(asInvocable("GPT 5.4"))).toThrow(
      "Unsupported coding agent model: GPT 5.4",
    );
  });

  it("throws for an unknown model id", () => {
    expect(() => toPiModelId(asInvocable("Nope"))).toThrow(
      "Unsupported coding agent model: Nope",
    );
  });

  it("maps a Pi model back to its catalog id", () => {
    expect(toChatModelId("opencode-go", "deepseek-v4-pro")).toBe(
      "Deepseek v4 Pro",
    );
  });

  it("returns undefined for other providers or unknown pi model ids", () => {
    expect(toChatModelId("anthropic", "deepseek-v4-pro")).toBeUndefined();
    expect(toChatModelId("opencode-go", "unknown-model")).toBeUndefined();
  });

  it("filters Pi models to the invocable catalog intersection, sorted", () => {
    const result = filterAvailableChatModels([
      { providerId: "opencode-go", modelId: "mimo-v2.5" },
      { providerId: "opencode-go", modelId: "deepseek-v4-pro" },
      { providerId: "opencode-go", modelId: "unknown-model" },
    ]);
    expect(result).toEqual(["Deepseek v4 Pro", "MiMo V2.5"]);
  });

  it("exposes the Pi provider id", () => {
    expect(PI_PROVIDER).toBe("opencode-go");
  });

  it("maps the Muse Spark catalog id to the meta Pi provider", () => {
    expect(toPiModelId("Muse Spark 1.2")).toEqual({
      providerId: "meta",
      modelId: "muse-spark-1.2",
    });
  });

  it("maps the meta Pi provider back to the catalog id", () => {
    expect(toChatModelId("meta", "muse-spark-1.2")).toBe("Muse Spark 1.2");
    expect(toChatModelId("meta", "unknown-model")).toBeUndefined();
  });

  it("maps provider kinds to pi provider ids", () => {
    expect(toPiProviderId("opencodeGo")).toBe("opencode-go");
    expect(toPiProviderId("metaModelApi")).toBe("meta");
  });

  it("exposes the custom pi provider config for meta", () => {
    expect(CUSTOM_PI_PROVIDERS.meta).toEqual({
      baseUrl: "https://api.meta.ai/v1",
      api: "openai-completions",
      apiKeyEnv: "META_API_KEY",
    });
  });

  it("filters Pi models to the invocable catalog intersection, sorted", () => {
    const result = filterAvailableChatModels([
      { providerId: "meta", modelId: "muse-spark-1.2" },
      { providerId: "opencode-go", modelId: "deepseek-v4-pro" },
      { providerId: "opencode-go", modelId: "unknown-model" },
    ]);
    expect(result).toEqual(["Deepseek v4 Pro", "Muse Spark 1.2"]);
  });
});
