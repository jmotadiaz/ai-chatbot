import { describe, expect, it } from "vitest";
import { chatModelKeys } from "@/lib/features/foundation-model/config";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";

describe("Gemini 4 Argon in the chat model configuration", () => {
  it("is selectable as a chat model", () => {
    expect(chatModelKeys).toContain("Gemini 4 Argon");
  });

  it("builds a configuration from the catalog entry", () => {
    const cfg = inferenceKit.languageModel("Gemini 4 Argon");
    expect(cfg.company).toBe("google");
    expect(cfg.reasoning).toBe(true);
    expect(cfg.contextWindow).toBe(1_048_576);
    expect(cfg.supportedFiles).toEqual(["img", "pdf"]);
    // El endpoint Google acepta thinkingLevel high + includeThoughts
    // (validado con llamadas reales): sin includeThoughts el reasoning llega
    // oculto y el chat no puede mostrarlo.
    expect(cfg.providerOptions?.google?.thinkingConfig).toEqual({
      includeThoughts: true,
      thinkingLevel: "high",
    });
  });

  it("exposes an opencodeGoGoogle client factory with the model id (mock in test mode)", () => {
    expect(inferenceKit.clients.opencodeGoGoogle).toBeDefined();
    expect(
      inferenceKit.clients.opencodeGoGoogle("gemini-4-argon-contributor"),
    ).toBeDefined();
  });
});
