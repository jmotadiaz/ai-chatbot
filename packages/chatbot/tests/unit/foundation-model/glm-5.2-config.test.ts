import { describe, expect, it } from "vitest";
import { chatModelKeys, languageModelConfigurations } from "@/lib/features/foundation-model/config";
import { providers } from "@/lib/infrastructure/ai/providers";

describe("GLM 5.2 in the chat model configuration", () => {
  it("is selectable as a chat model", () => {
    expect(chatModelKeys).toContain("GLM 5.2");
  });

  it("builds a configuration from the catalog entry", () => {
    const cfg = languageModelConfigurations("GLM 5.2");
    expect(cfg.company).toBe("zai");
    expect(cfg.reasoning).toBe(true);
    expect(cfg.temperature).toBe(0.6);
    expect(cfg.topP).toBe(0.95);
    expect(cfg.contextWindow).toBe(1_000_000);
    expect(cfg.supportedFiles).toBeUndefined();
  });

  it("exposes an opencodeGo provider factory with the model id (mock in test mode)", () => {
    expect(providers.opencodeGo).toBeDefined();
    expect(providers.opencodeGo("glm-5.2")).toBeDefined();
  });
});
