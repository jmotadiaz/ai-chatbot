import { describe, expect, it } from "vitest";
import { chatModelKeys } from "@/lib/features/foundation-model/config";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";

describe("MiMo V2.6 in the chat model configuration", () => {
  it("exposes Flash and Pro as selectable chat models", () => {
    expect(chatModelKeys).toContain("MiMo V2.6 Flash");
    expect(chatModelKeys).toContain("MiMo V2.6 Pro");
  });

  it("builds the Flash configuration from the catalog entry", () => {
    const cfg = inferenceKit.languageModel("MiMo V2.6 Flash");
    expect(cfg.company).toBe("xiaomi");
    expect(cfg.reasoning).toBe(true);
    expect(cfg.temperature).toBe(0.6);
    expect(cfg.topP).toBe(0.95);
    expect(cfg.contextWindow).toBe(1_048_576);
    expect(cfg.supportedFiles).toEqual(["img", "pdf"]);
  });

  it("builds the Pro configuration from the catalog entry", () => {
    const cfg = inferenceKit.languageModel("MiMo V2.6 Pro");
    expect(cfg.company).toBe("xiaomi");
    expect(cfg.reasoning).toBe(true);
    expect(cfg.temperature).toBe(0.6);
    expect(cfg.topP).toBe(0.95);
    expect(cfg.contextWindow).toBe(1_048_576);
    expect(cfg.supportedFiles).toEqual(["img", "pdf"]);
  });

  it("exposes an opencodeGo client factory with the model ids (mock in test mode)", () => {
    expect(inferenceKit.clients.opencodeGo).toBeDefined();
    expect(inferenceKit.clients.opencodeGo("mimo-v2.6-flash")).toBeDefined();
    expect(inferenceKit.clients.opencodeGo("mimo-v2.6-pro")).toBeDefined();
  });
});
