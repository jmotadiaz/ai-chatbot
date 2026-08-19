import { describe, expect, it } from "vitest";
import { chatModelKeys, languageModelConfigurations } from "@/lib/features/foundation-model/config";
import { providers } from "@/lib/infrastructure/ai/providers";

describe("GLM 5.3 in the chat model configuration", () => {
  it("is selectable as a chat model", () => {
    expect(chatModelKeys).toContain("GLM 5.3");
  });

  it("builds a configuration from the catalog entry", () => {
    const cfg = languageModelConfigurations("GLM 5.3");
    expect(cfg.company).toBe("zai");
    expect(cfg.reasoning).toBe(true);
    expect(cfg.temperature).toBe(0.6);
    expect(cfg.topP).toBe(0.95);
    expect(cfg.contextWindow).toBe(1_000_000);
    expect(cfg.supportedFiles).toBeUndefined();
  });

  it("exposes a gateway provider factory with the gateway route id (mock in test mode)", () => {
    expect(providers.gateway).toBeDefined();
    expect(providers.gateway("zai/glm-5.3")).toBeDefined();
  });
});
