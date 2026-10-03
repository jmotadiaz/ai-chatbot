import { describe, expect, it } from "vitest";
import { chatModelKeys } from "@/lib/features/foundation-model/config";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";

describe("Space Bunny Free in the chat model configuration", () => {
  it("is selectable as a chat model", () => {
    expect(chatModelKeys).toContain("Space Bunny Free");
  });

  it("builds a configuration from the catalog entry", () => {
    const cfg = inferenceKit.languageModel("Space Bunny Free");
    expect(cfg.company).toBe("ai chatbot");
    expect(cfg.reasoning).toBe(true);
    expect(cfg.contextWindow).toBe(1_048_576);
    expect(cfg.supportedFiles).toEqual(["img"]);
  });

  it("exposes an openai-completions client factory with the opencode model id (mock in test mode)", () => {
    expect(inferenceKit.clients.opencodeGo).toBeDefined();
    expect(inferenceKit.clients.opencodeGo("space-bunny-free")).toBeDefined();
  });
});
