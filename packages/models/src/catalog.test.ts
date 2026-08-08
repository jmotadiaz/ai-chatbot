import { describe, expect, it } from "vitest";
import {
  INVOCABLE_MODEL_IDS,
  MODEL_CATALOG,
  getDefaultThinkingLevel,
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

  it("every userInvocable entry uses the opencodeGo provider", () => {
    const offenders = MODEL_CATALOG.filter(
      (e) => e.userInvocable && e.provider.kind !== "opencodeGo",
    );
    expect(offenders).toEqual([]);
  });

  it("exposes exactly the coding-agent models as invocable, in order", () => {
    expect([...INVOCABLE_MODEL_IDS]).toEqual([
      "Deepseek v4 Flash",
      "Deepseek v4 Pro",
      "Kimi K2.7 Code",
      "Kimi K3",
      "MiniMax M3",
      "Qwen 3.7 Plus",
      "Qwen 3.8 Max",
      "MiMo V2.5",
      "MiMo V2.5 Pro",
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
  });

  it("returns undefined for models without a declared default", () => {
    expect(getDefaultThinkingLevel("StepFun 3.5" as never)).toBeUndefined();
  });
});
