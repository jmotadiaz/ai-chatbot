import { describe, expect, it } from "vitest";
import { chatModelKeys } from "@/lib/features/foundation-model/config";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";

describe("Muse Spark 1.3 in the chat model configuration", () => {
  it("is selectable as a chat model", () => {
    expect(chatModelKeys).toContain("Muse Spark 1.3");
  });

  it("builds a configuration from the catalog entry", () => {
    const cfg = inferenceKit.languageModel("Muse Spark 1.3");
    expect(cfg.company).toBe("meta");
    expect(cfg.reasoning).toBe(true);
    expect(cfg.temperature).toBe(1);
    expect(cfg.topP).toBe(0.95);
    expect(cfg.topK).toBe(64);
    expect(cfg.supportedFiles).toEqual(["img"]);
    // El upstream de OpenCode Go no soporta el Responses API stateful: sin
    // store:false el AI SDK reenvía el historial como item_reference y falla
    // con "No function call found for function call output".
    expect(cfg.providerOptions?.openai?.store).toBe(false);
  });

  it("exposes an opencodeGoResponses client factory with the opencode model id (mock in test mode)", () => {
    expect(inferenceKit.clients.opencodeGoResponses).toBeDefined();
    expect(
      inferenceKit.clients.opencodeGoResponses("muse-spark-1.3-contributor"),
    ).toBeDefined();
  });
});
