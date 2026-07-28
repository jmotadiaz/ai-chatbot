import { describe, expect, it } from "vitest";
import { generateModelsJson } from "./generate-models-json";
import { INVOCABLE_MODEL_IDS } from "./catalog";

describe("generateModelsJson", () => {
  const json = generateModelsJson();

  it("emits one Pi model per invocable catalog entry", () => {
    const models = json.providers["opencode-go"].models;
    expect(models).toHaveLength(INVOCABLE_MODEL_IDS.length);
    expect(models.map((m) => m.name)).toEqual([...INVOCABLE_MODEL_IDS]);
  });

  it("uses the provider modelId as Pi id", () => {
    const models = json.providers["opencode-go"].models;
    expect(models.find((m) => m.name === "Deepseek v4 Pro")?.id).toBe(
      "deepseek-v4-pro",
    );
  });

  it("derives image input from supportedFiles", () => {
    const models = json.providers["opencode-go"].models;
    expect(models.find((m) => m.name === "Kimi K2.6")?.input).toEqual([
      "text",
      "image",
    ]);
    expect(models.find((m) => m.name === "Deepseek v4 Pro")?.input).toEqual([
      "text",
    ]);
  });

  it("carries reasoning and omits optional numeric fields when absent", () => {
    const models = json.providers["opencode-go"].models;
    const pro = models.find((m) => m.name === "Deepseek v4 Pro");
    expect(pro?.reasoning).toBe(true);
    expect(pro).not.toHaveProperty("contextWindow");
    expect(pro).not.toHaveProperty("maxTokens");
  });
});
