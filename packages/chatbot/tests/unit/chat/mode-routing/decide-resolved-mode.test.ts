import { describe, expect, it } from "vitest";
import { CHAT_MODE_ROUTING_CONFIDENCE_THRESHOLD } from "@/lib/features/chat/mode-routing/constants";
import {
  decideResolvedMode,
  isRoutingDecision,
  type RoutingDecisionInput,
} from "@/lib/features/chat/mode-routing/policy";

const decision = (
  overrides: Partial<RoutingDecisionInput> = {},
): RoutingDecisionInput => ({
  mode: "context7",
  reason: "routed",
  confidence: 0.9,
  modelId: "typesafe/jev-1.13",
  ...overrides,
});

describe("decideResolvedMode", () => {
  it.each([
    {
      name: "confident ctx7 option routes to the context7 mode",
      input: decision({ mode: "ctx7" }),
      expected: { mode: "context7", reason: "routed" },
    },
    {
      name: "confident ctx7 answer routes to context7",
      input: decision({ mode: "context7" }),
      expected: { mode: "context7", reason: "routed" },
    },
    {
      name: "confident web answer routes to web",
      input: decision({ mode: "web" }),
      expected: { mode: "web", reason: "routed" },
    },
    {
      name: "the neither option answers the neutral branch",
      input: decision({ mode: "neither" }),
      expected: { mode: "neutral", reason: "neither" },
    },
    {
      name: "neither answers the neutral branch",
      input: decision({ mode: "neutral", reason: "neither" }),
      expected: { mode: "neutral", reason: "neither" },
    },
    {
      name: "neither ignores a low confidence",
      input: decision({ mode: "neutral", reason: "neither", confidence: 0.1 }),
      expected: { mode: "neutral", reason: "neither" },
    },
    {
      name: "confidence below the threshold degrades to low_confidence",
      input: decision({
        confidence: CHAT_MODE_ROUTING_CONFIDENCE_THRESHOLD - 0.01,
      }),
      expected: { mode: "neutral", reason: "low_confidence" },
    },
    {
      name: "confidence exactly at the threshold still routes",
      input: decision({ confidence: CHAT_MODE_ROUTING_CONFIDENCE_THRESHOLD }),
      expected: { mode: "context7", reason: "routed" },
    },
    {
      name: "a tool-backed answer without confidence fails closed",
      input: decision({ mode: "web", confidence: undefined }),
      expected: { mode: "neutral", reason: "fallback" },
    },
    {
      name: "a non-finite confidence fails closed",
      input: decision({ confidence: Number.NaN }),
      expected: { mode: "neutral", reason: "fallback" },
    },
    {
      name: "a thrown error is a fallback",
      input: new Error("router exploded"),
      expected: { mode: "neutral", reason: "fallback" },
    },
    {
      name: "a timeout is a fallback",
      input: Object.assign(new Error("timed out"), { name: "TimeoutError" }),
      expected: { mode: "neutral", reason: "fallback" },
    },
    {
      name: "an undefined answer is a fallback",
      input: undefined,
      expected: { mode: "neutral", reason: "fallback" },
    },
    {
      name: "a decision without a mode is invalid",
      input: { reason: "routed", confidence: 0.9, modelId: "m" },
      expected: { mode: "neutral", reason: "fallback" },
    },
    {
      name: "a decision with an unknown mode is invalid",
      input: { mode: "rag", reason: "routed", confidence: 0.9, modelId: "m" },
      expected: { mode: "neutral", reason: "fallback" },
    },
    {
      name: "a decision without a modelId is invalid",
      input: { mode: "web", reason: "routed", confidence: 0.9 },
      expected: { mode: "neutral", reason: "fallback" },
    },
  ])("$name", ({ input, expected }) => {
    expect(decideResolvedMode(input)).toEqual(expected);
  });
});

describe("isRoutingDecision", () => {
  it("accepts well-formed decisions and rejects everything else", () => {
    expect(isRoutingDecision(decision())).toBe(true);
    expect(isRoutingDecision(decision({ confidence: undefined }))).toBe(true);
    expect(isRoutingDecision(decision({ mode: "ctx7" }))).toBe(true);
    expect(isRoutingDecision(decision({ mode: "neither" }))).toBe(true);
    expect(isRoutingDecision(null)).toBe(false);
    expect(isRoutingDecision("ctx7")).toBe(false);
    expect(isRoutingDecision({ mode: "banana", modelId: "m" })).toBe(false);
    expect(isRoutingDecision({ mode: "web", modelId: "" })).toBe(false);
  });
});
