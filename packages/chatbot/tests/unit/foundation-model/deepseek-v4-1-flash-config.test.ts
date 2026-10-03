import { describe, expect, it } from "vitest";
import { chatModelKeys } from "@/lib/features/foundation-model/config";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";

describe("Deepseek v4.1 Flash in the chat model configuration", () => {
  it("is selectable as a chat model", () => {
    expect(chatModelKeys).toContain("Deepseek v4.1 Flash");
  });

  it("builds a configuration from the catalog entry", () => {
    const cfg = inferenceKit.languageModel("Deepseek v4.1 Flash");
    expect(cfg.company).toBe("deepseek");
    expect(cfg.reasoning).toBe(true);
    expect(cfg.temperature).toBe(1);
    expect(cfg.topP).toBe(0.95);
    expect(cfg.contextWindow).toBe(1_000_000);
    expect(cfg.supportedFiles).toEqual(["img"]);
  });

  it("exposes an opencodeGo client factory with the model id (mock in test mode)", () => {
    expect(inferenceKit.clients.opencodeGo).toBeDefined();
    expect(inferenceKit.clients.opencodeGo("deepseek-v4.1-flash")).toBeDefined();
  });
});
