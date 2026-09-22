import { describe, expect, it } from "vitest";
import { languageModelConfigurations } from "@/lib/features/foundation-model/server";
import { chatModelKeys } from "@/lib/features/foundation-model/config";
import { providers } from "@/lib/infrastructure/ai/providers";

describe("MiMo V2.6 in the chat model configuration", () => {
  it("exposes Flash and Pro as selectable chat models", () => {
    expect(chatModelKeys).toContain("MiMo V2.6 Flash");
    expect(chatModelKeys).toContain("MiMo V2.6 Pro");
  });

  it("builds the Flash configuration from the catalog entry", () => {
    const cfg = languageModelConfigurations("MiMo V2.6 Flash");
    expect(cfg.company).toBe("xiaomi");
    expect(cfg.reasoning).toBe(true);
    expect(cfg.temperature).toBe(0.6);
    expect(cfg.topP).toBe(0.95);
    expect(cfg.contextWindow).toBe(1_048_576);
    expect(cfg.supportedFiles).toEqual(["img", "pdf"]);
  });

  it("builds the Pro configuration from the catalog entry", () => {
    const cfg = languageModelConfigurations("MiMo V2.6 Pro");
    expect(cfg.company).toBe("xiaomi");
    expect(cfg.reasoning).toBe(true);
    expect(cfg.temperature).toBe(0.6);
    expect(cfg.topP).toBe(0.95);
    expect(cfg.contextWindow).toBe(1_048_576);
    expect(cfg.supportedFiles).toEqual(["img", "pdf"]);
  });

  it("exposes an opencodeGo provider factory with the model ids (mock in test mode)", () => {
    expect(providers.opencodeGo).toBeDefined();
    expect(providers.opencodeGo("mimo-v2.6-flash")).toBeDefined();
    expect(providers.opencodeGo("mimo-v2.6-pro")).toBeDefined();
  });
});
