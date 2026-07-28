import { describe, expect, it } from "vitest";
import {
  filterAvailableChatModels,
  PI_PROVIDER,
  toChatModelId,
  toPiModelId,
} from "./mapping";

describe("model mapping", () => {
  it("maps an invocable model id to its Pi model", () => {
    expect(toPiModelId("Deepseek v4 Pro")).toEqual({
      providerId: "opencode-go",
      modelId: "deepseek-v4-pro",
    });
  });

  it("throws for a non-invocable catalog model", () => {
    expect(() => toPiModelId("GPT 5.4")).toThrow(
      "Unsupported coding agent model: GPT 5.4",
    );
  });

  it("throws for an unknown model id", () => {
    expect(() => toPiModelId("Nope")).toThrow(
      "Unsupported coding agent model: Nope",
    );
  });

  it("maps a Pi model back to its catalog id", () => {
    expect(toChatModelId("opencode-go", "deepseek-v4-pro")).toBe(
      "Deepseek v4 Pro",
    );
  });

  it("returns undefined for other providers or unknown pi model ids", () => {
    expect(toChatModelId("anthropic", "deepseek-v4-pro")).toBeUndefined();
    expect(toChatModelId("opencode-go", "unknown-model")).toBeUndefined();
  });

  it("filters Pi models to the invocable catalog intersection, sorted", () => {
    const result = filterAvailableChatModels([
      { providerId: "opencode-go", modelId: "mimo-v2.5" },
      { providerId: "opencode-go", modelId: "deepseek-v4-pro" },
      { providerId: "opencode-go", modelId: "unknown-model" },
    ]);
    expect(result).toEqual(["Deepseek v4 Pro", "MiMo V2.5"]);
  });

  it("exposes the Pi provider id", () => {
    expect(PI_PROVIDER).toBe("opencode-go");
  });
});
