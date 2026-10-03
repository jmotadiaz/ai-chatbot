import { describe, expect, it } from "vitest";
import { chatModelKeys } from "@/lib/features/foundation-model/config";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";

describe("Hy3 in the chat model configuration", () => {
  it("is selectable as a chat model", () => {
    expect(chatModelKeys).toContain("Hy3");
  });

  it("builds a configuration from the catalog entry", () => {
    const cfg = inferenceKit.languageModel("Hy3");
    expect(cfg.company).toBe("tencent");
    expect(cfg.reasoning).toBe(true);
    expect(cfg.contextWindow).toBe(262_144);
  });

  it("exposes an opencodeGo client factory with the model id (mock in test mode)", () => {
    expect(inferenceKit.clients.opencodeGo).toBeDefined();
    expect(inferenceKit.clients.opencodeGo("hy3")).toBeDefined();
  });
});
