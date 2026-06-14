import { describe, it, expect } from "vitest";
import {
  toPiModelId,
  toChatModelId,
  filterAvailableChatModels,
} from "@/lib/features/agent-code/model-mapping";
import type { chatModelId } from "@/lib/features/foundation-model/config";

describe("model-mapping", () => {
  it("maps chatModelId to Pi opencodeGo modelId", () => {
    expect(toPiModelId("Deepseek v4 Pro")).toEqual({
      providerId: "opencodeGo",
      modelId: "deepseek-v4-pro",
    });
  });

  it("maps Pi model to chatModelId", () => {
    expect(toChatModelId("opencodeGo", "deepseek-v4-pro")).toBe(
      "Deepseek v4 Pro",
    );
  });

  it("filters Pi models to chatModelId intersection", () => {
    const piModels = [
      { providerId: "opencodeGo", modelId: "deepseek-v4-pro" },
      { providerId: "opencodeGo", modelId: "unknown-model" },
    ];
    const result = filterAvailableChatModels(piModels);
    expect(result).toEqual(["Deepseek v4 Pro"]);
  });
});
