import { describe, expect, it } from "vitest";
import { chatModelKeys, languageModelConfigurations } from "@/lib/features/foundation-model/config";
import { providers } from "@/lib/infrastructure/ai/providers";

describe("Omen Alpha in the chat model configuration", () => {
  it("is selectable as a chat model", () => {
    expect(chatModelKeys).toContain("Omen Alpha");
  });

  it("builds a configuration from the catalog entry", () => {
    const cfg = languageModelConfigurations("Omen Alpha");
    expect(cfg.company).toBe("ai-chatbot");
    expect(cfg.reasoning).toBe(true);
    expect(cfg.contextWindow).toBe(500_000);
    expect(cfg.supportedFiles).toEqual(["img"]);
  });

  it("exposes an opencodeGo provider factory with the model id (mock in test mode)", () => {
    expect(providers.opencodeGo).toBeDefined();
    expect(providers.opencodeGo("omen-alpha")).toBeDefined();
  });
});
