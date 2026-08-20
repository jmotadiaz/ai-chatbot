import { describe, expect, it } from "vitest";
import { chatModelKeys, languageModelConfigurations } from "@/lib/features/foundation-model/config";
import { providers } from "@/lib/infrastructure/ai/providers";

describe("Hy3 in the chat model configuration", () => {
  it("is selectable as a chat model", () => {
    expect(chatModelKeys).toContain("Hy3");
  });

  it("builds a configuration from the catalog entry", () => {
    const cfg = languageModelConfigurations("Hy3");
    expect(cfg.company).toBe("tencent");
    expect(cfg.reasoning).toBe(true);
    expect(cfg.contextWindow).toBe(262_144);
  });

  it("exposes an opencodeGo provider factory with the model id (mock in test mode)", () => {
    expect(providers.opencodeGo).toBeDefined();
    expect(providers.opencodeGo("hy3")).toBeDefined();
  });
});
