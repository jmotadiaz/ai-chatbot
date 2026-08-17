import { describe, expect, it } from "vitest";
import {
  INVOCABLE_MODEL_IDS,
  MODEL_CATALOG,
  getDefaultThinkingLevel,
  getSupportedThinkingLevels,
  type ThinkingLevel,
} from "./catalog";

describe("MODEL_CATALOG integrity", () => {
  it("has unique ids", () => {
    const ids = MODEL_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique opencodeGo provider modelIds (needed for reverse mapping)", () => {
    const keys = MODEL_CATALOG
      .filter((e) => e.provider.kind === "opencodeGo")
      .map((e) => e.provider.modelId);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("custom-provider entries (gateway) fully describe their Pi model", () => {
    // Pi no trae built-in "meta/muse-spark-1.2-contributor": la entrada del
    // catálogo debe declarar límites, coste y thinkingLevelMap propios (el
    // generador ya lanza error si faltan).
    const custom = MODEL_CATALOG.filter(
      (e): e is Extract<(typeof MODEL_CATALOG)[number], { userInvocable: true; provider: { kind: "gateway" } }> =>
        e.userInvocable && e.provider.kind === "gateway",
    );
    expect(custom.length).toBeGreaterThan(0);
    for (const entry of custom) {
      expect(entry.reasoning).toBe(true);
      expect(entry.defaultThinkingLevel).toBeDefined();
      expect(entry.contextWindow).toBeGreaterThan(0);
      expect(entry.maxTokens).toBeGreaterThan(0);
      expect(entry.cost).toBeDefined();
      expect(entry.thinkingLevelMap).toBeDefined();
      expect(entry.thinkingLevelMap?.off).toBeNull();
    }
  });

  it("exposes exactly the coding-agent models as invocable, in order", () => {
    expect([...INVOCABLE_MODEL_IDS]).toEqual([
      "Deepseek v4 Flash",
      "Deepseek v4 Flash (free)",
      "Deepseek v4 Pro",
      "Kimi K2.7 Code",
      "Kimi K3",
      "MiniMax M3",
      "Qwen 3.7 Plus",
      "Qwen 3.8 Max",
      "Qwen 3.8 27B",
      "MiMo V2.5",
      "MiMo V2.5 Pro",
      "Muse Spark 1.2",
      "Gemini 3.7 Flash",
    ]);
  });

  it("keeps every model id used by internal chatbot features", () => {
    const ids = new Set<string>(MODEL_CATALOG.map((e) => e.id));
    for (const internal of [
      "Llama 3.1 Instant",
      "GPT OSS Mini",
      "GPT OSS",
      "Nano Banana",
      "Gemini 2.5 Flash Lite",
      "Gemini 3 Flash",
      "Deepseek v4 Flash",
      "Gemini 3.1 Flash Lite",
    ]) {
      expect(ids.has(internal)).toBe(true);
    }
  });
});

describe("defaultThinkingLevel", () => {
  const LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

  it("declares a valid defaultThinkingLevel for every userInvocable model", () => {
    for (const entry of MODEL_CATALOG) {
      if (!entry.userInvocable) continue;
      expect(LEVELS).toContain(entry.defaultThinkingLevel);
    }
  });

  it("resolves the catalog default for known coding-agent models", () => {
    expect(getDefaultThinkingLevel("Deepseek v4 Pro")).toBe("xhigh");
    expect(getDefaultThinkingLevel("Kimi K2.7 Code")).toBe("high");
    expect(getDefaultThinkingLevel("Muse Spark 1.2")).toBe("xhigh");
  });

  it("returns undefined for models without a declared default", () => {
    expect(getDefaultThinkingLevel("StepFun 3.5" as never)).toBeUndefined();
  });
});

describe("getSupportedThinkingLevels", () => {
  it("only supports off when reasoning is disabled or unknown", () => {
    expect(getSupportedThinkingLevels(undefined, undefined)).toEqual(["off"]);
    expect(getSupportedThinkingLevels(false, undefined)).toEqual(["off"]);
  });

  it("supports the default level ladder for reasoning models without a map", () => {
    expect(getSupportedThinkingLevels(true, undefined)).toEqual([
      "off",
      "minimal",
      "low",
      "medium",
      "high",
    ]);
  });

  it("drops levels mapped to null and adds xhigh only with an explicit mapping", () => {
    expect(
      getSupportedThinkingLevels(true, {
        minimal: null,
        low: null,
        medium: null,
        high: "high",
        xhigh: "max",
      }),
    ).toEqual(["off", "high", "xhigh"]);
  });

  it("keeps off + high when the map only nulls the lower levels", () => {
    expect(
      getSupportedThinkingLevels(true, {
        minimal: null,
        low: null,
        medium: null,
      }),
    ).toEqual(["off", "high"]);
  });

  it("hides off when the map nulls it and keeps minimal..xhigh for Muse Spark", () => {
    expect(
      getSupportedThinkingLevels(true, {
        off: null,
        minimal: "minimal",
        low: "low",
        medium: "medium",
        high: "high",
        xhigh: "xhigh",
      }),
    ).toEqual(["minimal", "low", "medium", "high", "xhigh"]);
  });
});
