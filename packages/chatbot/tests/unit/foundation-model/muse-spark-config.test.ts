import { describe, expect, it } from "vitest";
import { chatModelKeys, languageModelConfigurations } from "@/lib/features/foundation-model/config";
import { providers } from "@/lib/infrastructure/ai/providers";

describe("Muse Spark 1.2 in the chat model configuration", () => {
  it("is selectable as a chat model", () => {
    expect(chatModelKeys).toContain("Muse Spark 1.2");
  });

  it("builds a configuration from the catalog entry", () => {
    const cfg = languageModelConfigurations("Muse Spark 1.2");
    expect(cfg.company).toBe("meta");
    expect(cfg.reasoning).toBe(true);
    expect(cfg.temperature).toBe(1);
    expect(cfg.topP).toBe(0.95);
    expect(cfg.topK).toBe(64);
    expect(cfg.supportedFiles).toBeUndefined();
  });

  it("exposes an opencodeGoResponses provider factory with the opencode model id (mock in test mode)", () => {
    expect(providers.opencodeGoResponses).toBeDefined();
    expect(providers.opencodeGoResponses("muse-spark-1.2-contributor")).toBeDefined();
  });
});
