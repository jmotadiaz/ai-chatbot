import { describe, expect, it } from "vitest";
import { chatModelKeys } from "@/lib/features/foundation-model/config";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";

describe("GLM 5.3 in the chat model configuration", () => {
  it("is selectable as a chat model", () => {
    expect(chatModelKeys).toContain("GLM 5.3");
  });

  it("builds a configuration from the catalog entry", () => {
    const cfg = inferenceKit.languageModel("GLM 5.3");
    expect(cfg.company).toBe("zai");
    expect(cfg.reasoning).toBe(true);
    expect(cfg.temperature).toBe(0.6);
    expect(cfg.topP).toBe(0.95);
    expect(cfg.contextWindow).toBe(1_000_000);
    expect(cfg.supportedFiles).toEqual(["img"]);
  });

  it("exposes an opencodeGo client factory with the model id (mock in test mode)", () => {
    expect(inferenceKit.clients.opencodeGo).toBeDefined();
    expect(inferenceKit.clients.opencodeGo("glm-5.3")).toBeDefined();
  });
});
