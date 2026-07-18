import { describe, it, expect } from "vitest";
import {
  toPiModelId,
  toChatModelId,
  filterAvailableChatModels,
} from "@/lib/features/code/model-mapping";

describe("model-mapping", () => {
  it("maps chatModelId to Pi opencode-go modelId", () => {
    expect(toPiModelId("Deepseek v4 Pro")).toEqual({
      providerId: "opencode-go",
      modelId: "deepseek-v4-pro",
    });
  });

  it("maps Pi model to chatModelId", () => {
    expect(toChatModelId("opencode-go", "deepseek-v4-pro")).toBe(
      "Deepseek v4 Pro",
    );
  });

  it("filters Pi models to chatModelId intersection", () => {
    const piModels = [
      { providerId: "opencode-go", modelId: "deepseek-v4-pro" },
      { providerId: "opencode-go", modelId: "unknown-model" },
    ];
    const result = filterAvailableChatModels(piModels);
    expect(result).toEqual(["Deepseek v4 Pro"]);
  });
});
