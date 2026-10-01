import { describe, expect, it, vi } from "vitest";
import type { DecideOptions, Decision } from "inference";
import {
  createEnglishClassifier,
  ENGLISH_CLASSIFIER_TRACE_NAME,
} from "../../../lib/features/english/workflows/classifier";
import {
  AUDIENCE_QUESTION_KEY,
  DIRECTION_QUESTION_KEY,
  DOMAIN_QUESTION_KEY,
} from "../../../lib/features/english/workflows/questions";

const answer = (choice: string) => ({
  choice,
  confidence: 0.9,
  probabilities: { [choice]: 0.9 },
});

const decisionWith = (
  answers: Decision["answers"],
): Decision => ({
  answers,
  modelId: "typesafe/jev-1.13-20260917",
  provider: "TypeSafe",
  latencyMs: 412,
  costUsd: 0.000017976,
});

const fullDecision = () =>
  decisionWith({
    [DIRECTION_QUESTION_KEY]: answer("en-to-es"),
    [AUDIENCE_QUESTION_KEY]: answer("internal"),
    [DOMAIN_QUESTION_KEY]: answer("devops"),
  });

describe("createEnglishClassifier: one Decisions call per workflow", () => {
  it("asks direction + audience + domain in one call for translation", async () => {
    const decide = vi.fn(async (_options: DecideOptions) => fullDecision());
    const classifier = createEnglishClassifier(decide);

    await classifier.classifyForTranslation("some text");

    expect(decide).toHaveBeenCalledTimes(1);
    const call = decide.mock.calls[0]![0];
    expect(call.model).toBe("englishHelper");
    expect(Object.keys(call.questions)).toEqual([
      DIRECTION_QUESTION_KEY,
      AUDIENCE_QUESTION_KEY,
      DOMAIN_QUESTION_KEY,
    ]);
    expect(call.state).toEqual({ text: "some text" });
    expect(call.scope).toEqual({ traceName: ENGLISH_CLASSIFIER_TRACE_NAME });
  });

  it("asks only audience + domain for grammar", async () => {
    const decide = vi.fn(async (_options: DecideOptions) => fullDecision());
    const classifier = createEnglishClassifier(decide);

    await classifier.classifyForGrammar("some text");

    expect(decide).toHaveBeenCalledTimes(1);
    const call = decide.mock.calls[0]![0];
    expect(Object.keys(call.questions)).toEqual([
      AUDIENCE_QUESTION_KEY,
      DOMAIN_QUESTION_KEY,
    ]);
  });

  it("maps the choices as-is (no confidence gate)", async () => {
    const decide = vi.fn(async () => fullDecision());
    const classifier = createEnglishClassifier(decide);

    const result = await classifier.classifyForTranslation("some text");

    expect(result).toEqual({
      direction: "en-to-es",
      audience: "internal",
      domain: "devops",
      provenance: {
        modelId: "typesafe/jev-1.13-20260917",
        provider: "TypeSafe",
        latencyMs: 412,
        costUsd: 0.000017976,
        answers: fullDecision().answers,
      },
    });
  });

  it("falls back per question on an unknown choice, keeping the valid ones", async () => {
    const decide = vi.fn(async () =>
      decisionWith({
        [DIRECTION_QUESTION_KEY]: answer("banana"),
        [AUDIENCE_QUESTION_KEY]: answer("executives"),
        // domain answer missing entirely
      }),
    );
    const classifier = createEnglishClassifier(decide);

    const result = await classifier.classifyForTranslation("some text");

    expect(result.direction).toBe("es-to-en");
    expect(result.audience).toBe("executives");
    expect(result.domain).toBe("none");
  });

  it("falls back to defaults when the call fails, marking the provenance unavailable", async () => {
    const decide = vi.fn(async () => {
      throw new Error("decide exploded");
    });
    const classifier = createEnglishClassifier(decide);

    const result = await classifier.classifyForTranslation("some text");

    expect(result).toEqual({
      direction: "es-to-en",
      audience: "general",
      domain: "none",
      provenance: { modelId: "unavailable", answers: {} },
    });
  });
});
