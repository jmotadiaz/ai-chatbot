import { describe, expect, it } from "vitest";
import { chatModelKeys } from "@/lib/features/foundation-model/config";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";

describe("Union Alpha Free in the chat model configuration", () => {
  it("is selectable as a chat model", () => {
    expect(chatModelKeys).toContain("Union Alpha Free");
  });

  it("builds a configuration from the catalog entry", () => {
    const cfg = inferenceKit.languageModel("Union Alpha Free");
    expect(cfg.company).toBe("ai chatbot");
    expect(cfg.reasoning).toBe(true);
    expect(cfg.contextWindow).toBe(262_144);
    expect(cfg.supportedFiles).toEqual(["img"]);
  });

  it("exposes an anthropic-messages client factory with the opencode model id (mock in test mode)", () => {
    expect(inferenceKit.clients.opencodeGoAnthropic).toBeDefined();
    expect(inferenceKit.clients.opencodeGoAnthropic("union-alpha")).toBeDefined();
  });
});
