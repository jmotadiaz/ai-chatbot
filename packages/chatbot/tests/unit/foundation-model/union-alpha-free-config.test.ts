import { describe, expect, it } from "vitest";
import { languageModelConfigurations } from "@/lib/features/foundation-model/server";
import { chatModelKeys } from "@/lib/features/foundation-model/config";
import { providers } from "@/lib/infrastructure/ai/providers";

describe("Union Alpha Free in the chat model configuration", () => {
  it("is selectable as a chat model", () => {
    expect(chatModelKeys).toContain("Union Alpha Free");
  });

  it("builds a configuration from the catalog entry", () => {
    const cfg = languageModelConfigurations("Union Alpha Free");
    expect(cfg.company).toBe("ai chatbot");
    expect(cfg.reasoning).toBe(true);
    expect(cfg.contextWindow).toBe(262_144);
    expect(cfg.supportedFiles).toEqual(["img"]);
  });

  it("exposes an anthropic-messages provider factory with the opencode model id (mock in test mode)", () => {
    expect(providers.opencodeGoAnthropic).toBeDefined();
    expect(providers.opencodeGoAnthropic("union-alpha")).toBeDefined();
  });
});
