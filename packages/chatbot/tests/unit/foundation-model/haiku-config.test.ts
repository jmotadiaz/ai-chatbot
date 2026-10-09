import { describe, expect, it } from "vitest";
import { chatModelKeys } from "@/lib/features/foundation-model/config";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";

describe("Haiku in the chat model configuration", () => {
  it("is selectable as a chat model", () => {
    expect(chatModelKeys).toContain("Haiku");
  });

  it("builds a configuration from the catalog entry", () => {
    const cfg = inferenceKit.languageModel("Haiku");
    expect(cfg.company).toBe("anthropic");
    expect(cfg.reasoning).toBe(true);
    expect(cfg.contextWindow).toBe(1_000_000);
    expect(cfg.supportedFiles).toEqual(["img", "pdf"]);
    // El upstream rechaza el thinking legacy ("thinking.type.enabled" is not
    // supported for this model): solo acepta thinking adaptativo con display
    // explícito (el default de adaptive es "omitted", que devuelve bloques
    // vacíos) más output_config.effort, que es lo que lo activa.
    expect(cfg.providerOptions?.anthropic?.thinking).toEqual({
      type: "adaptive",
      display: "summarized",
    });
    expect(cfg.providerOptions?.anthropic?.effort).toBe("high");
  });

  it("exposes an opencodeGoAnthropic client factory with the model id (mock in test mode)", () => {
    expect(inferenceKit.clients.opencodeGoAnthropic).toBeDefined();
    expect(
      inferenceKit.clients.opencodeGoAnthropic("claude-haiku-5-5"),
    ).toBeDefined();
  });
});
