import { describe, expect, it } from "vitest";
import { chatModelKeys } from "@/lib/features/foundation-model/config";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";

describe("Step 5 Preview Free in the chat model configuration", () => {
  it("is selectable as a chat model", () => {
    expect(chatModelKeys).toContain("Step 5 Preview Free");
  });

  it("builds a configuration from the catalog entry", () => {
    const cfg = inferenceKit.languageModel("Step 5 Preview Free");
    expect(cfg.company).toBe("stepfun");
    expect(cfg.reasoning).toBe(true);
    expect(cfg.contextWindow).toBe(1_000_000);
    // El registry de opencode-go declara entrada de texto, imagen y vídeo; el
    // catálogo solo modela img/pdf, así que la imagen es lo que se expone.
    expect(cfg.supportedFiles).toEqual(["img"]);
    // Sin `supportedOutput` declarada: el modelo solo devuelve texto, que es lo
    // que asume la configuración de chat (`["text"]`).
    expect(cfg.supportedOutput).toBeUndefined();
  });

  it("exposes an openai-completions client factory with the opencode model id (mock in test mode)", () => {
    expect(inferenceKit.clients.opencodeGo).toBeDefined();
    expect(inferenceKit.clients.opencodeGo("step-5-preview-free")).toBeDefined();
  });
});
