import { describe, expect, it } from "vitest";
import {
  filterAvailableChatModels,
  PI_PROVIDER,
  toChatModelId,
  toPiModelId,
  toPiProviderId,
} from "./mapping";
import type { InvocableModelId } from "./catalog";

/** The type rules these ids out; the runtime guard is what's under test. */
const asInvocable = (id: string) => id as InvocableModelId;

describe("model mapping", () => {
  it("maps an invocable model id to its Pi model", () => {
    expect(toPiModelId("Deepseek v4.1 Flash")).toEqual({
      providerId: "opencode-go",
      modelId: "deepseek-v4.1-flash",
    });
  });

  it("throws for a non-invocable catalog model", () => {
    expect(() => toPiModelId(asInvocable("GPT 5.4"))).toThrow(
      "Unsupported coding agent model: GPT 5.4",
    );
  });

  it("throws for an unknown model id", () => {
    expect(() => toPiModelId(asInvocable("Nope"))).toThrow(
      "Unsupported coding agent model: Nope",
    );
  });

  it("maps a Pi model back to its catalog id", () => {
    expect(toChatModelId("opencode-go", "deepseek-v4.1-flash")).toBe(
      "Deepseek v4.1 Flash",
    );
  });

  it("returns undefined for other providers or unknown pi model ids", () => {
    expect(toChatModelId("anthropic", "deepseek-v4.1-flash")).toBeUndefined();
    expect(toChatModelId("opencode-go", "unknown-model")).toBeUndefined();
  });

  it("filters Pi models to the invocable catalog intersection, sorted", () => {
    const result = filterAvailableChatModels([
      { providerId: "opencode-go", modelId: "kimi-k3" },
      { providerId: "opencode-go", modelId: "deepseek-v4.1-flash" },
      { providerId: "opencode-go", modelId: "unknown-model" },
    ]);
    expect(result).toEqual(["Deepseek v4.1 Flash", "Kimi K3"]);
  });

  it("exposes the Pi provider id", () => {
    expect(PI_PROVIDER).toBe("opencode-go");
  });

  it("maps the Muse Spark catalog id to the opencode-go Pi provider", () => {
    expect(toPiModelId("Muse Spark 1.3")).toEqual({
      providerId: "opencode-go",
      modelId: "muse-spark-1.3-contributor",
    });
  });

  it("maps the opencode-go Pi model back to the catalog id", () => {
    expect(
      toChatModelId("opencode-go", "muse-spark-1.3-contributor"),
    ).toBe("Muse Spark 1.3");
    expect(toChatModelId("opencode-go", "unknown-model")).toBeUndefined();
  });

  it("maps provider kinds to pi provider ids", () => {
    expect(toPiProviderId("opencodeGo")).toBe("opencode-go");
    expect(toPiProviderId("opencodeGoResponses")).toBe("opencode-go");
    expect(toPiProviderId("opencodeGoAnthropic")).toBe("opencode-go");
    expect(toPiProviderId("gateway")).toBe("vercel-ai-gateway");
    expect(toPiProviderId("openrouter")).toBe("openrouter");
  });

  it("maps the Gemini 3.7 Flash catalog id to the vercel-ai-gateway Pi provider", () => {
    expect(toPiModelId("Gemini 3.7 Flash")).toEqual({
      providerId: "vercel-ai-gateway",
      modelId: "google/gemini-3.7-flash",
    });
    expect(toChatModelId("vercel-ai-gateway", "google/gemini-3.7-flash")).toBe(
      "Gemini 3.7 Flash",
    );
  });

  it("maps the GLM 5.3 catalog id to the opencode-go Pi provider", () => {
    expect(toPiModelId("GLM 5.3")).toEqual({
      providerId: "opencode-go",
      modelId: "glm-5.3",
    });
    expect(toChatModelId("opencode-go", "glm-5.3")).toBe("GLM 5.3");
  });

  it("maps the Union Alpha Free catalog id to the opencode-go Pi provider", () => {
    expect(toPiModelId("Union Alpha Free")).toEqual({
      providerId: "opencode-go",
      modelId: "union-alpha",
    });
    expect(toChatModelId("opencode-go", "union-alpha")).toBe(
      "Union Alpha Free",
    );
  });

  it("maps the Hy3 catalog id to the opencode-go Pi provider", () => {
    expect(toPiModelId("Hy3")).toEqual({
      providerId: "opencode-go",
      modelId: "hy3",
    });
    expect(toChatModelId("opencode-go", "hy3")).toBe(
      "Hy3",
    );
  });

  it("maps the Deepseek v4.1 Flash catalog id to the opencode-go Pi provider", () => {
    expect(toPiModelId("Deepseek v4.1 Flash")).toEqual({
      providerId: "opencode-go",
      modelId: "deepseek-v4.1-flash",
    });
    expect(toChatModelId("opencode-go", "deepseek-v4.1-flash")).toBe(
      "Deepseek v4.1 Flash",
    );
  });

  it("filters Pi models to the invocable catalog intersection, sorted", () => {
    const result = filterAvailableChatModels([
      {
        providerId: "opencode-go",
        modelId: "muse-spark-1.3-contributor",
      },
      { providerId: "opencode-go", modelId: "deepseek-v4.1-flash" },
      { providerId: "opencode-go", modelId: "unknown-model" },
    ]);
    expect(result).toEqual(["Deepseek v4.1 Flash", "Muse Spark 1.3"]);
  });
});
