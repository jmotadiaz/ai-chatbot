import { describe, expect, it } from "vitest";
import { languageModelConfigurations } from "@/lib/features/foundation-model/server"; import { chatModelKeys } from "@/lib/features/foundation-model/config";
import { providers } from "@/lib/infrastructure/ai/providers";

describe("Deepseek v4.1 Flash in the chat model configuration", () => {
  it("is selectable as a chat model", () => {
    expect(chatModelKeys).toContain("Deepseek v4.1 Flash");
  });

  it("builds a configuration from the catalog entry", () => {
    const cfg = languageModelConfigurations("Deepseek v4.1 Flash");
    expect(cfg.company).toBe("deepseek");
    expect(cfg.reasoning).toBe(true);
    expect(cfg.temperature).toBe(1);
    expect(cfg.topP).toBe(0.95);
    expect(cfg.contextWindow).toBe(1_000_000);
    expect(cfg.supportedFiles).toBeUndefined();
  });

  it("exposes an opencodeGo provider factory with the model id (mock in test mode)", () => {
    expect(providers.opencodeGo).toBeDefined();
    expect(providers.opencodeGo("deepseek-flash")).toBeDefined();
  });
});
