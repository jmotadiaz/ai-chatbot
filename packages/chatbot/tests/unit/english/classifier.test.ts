import { describe, expect, it } from "vitest";
import {
  GatewayScenarioError,
  decisionsResponse,
} from "@ai-chatbot/model-gateway-testing";
import type {
  DecisionsRequest,
  GatewayScenario,
} from "@ai-chatbot/model-gateway-testing";
import { runWithTraceContext } from "tracing";
import {
  classifyForGrammar,
  classifyForTranslation,
} from "@/lib/features/english/workflows/classifier";
import {
  AUDIENCE_QUESTION_KEY,
  DIRECTION_QUESTION_KEY,
  DOMAIN_QUESTION_KEY,
} from "@/lib/features/english/workflows/questions";
import {
  FALLBACK_AUDIENCE,
  FALLBACK_DIRECTION,
  FALLBACK_DOMAIN,
  type ClassificationAnswerProvenance,
} from "@/lib/features/english/workflows/policy";
import { setupGatewayHarness } from "@/tests/helpers/gateway-harness";

/**
 * Social unit tests of the English Helper classifier at the Model Gateway HTTP
 * seam (ADR 0013): `classifyForTranslation`/`classifyForGrammar` are the real
 * functions, `inferenceKit.decide` is the real client and MSW answers
 * `POST /v1/systemone` deterministically. No injected decision function and no
 * fake `Decision`; the request and the answer are the wire shapes.
 *
 * These tests pass with no gateway listening on `:4001`.
 */
const gateway = setupGatewayHarness();

/** The recorded `POST /v1/systemone` bodies, oldest first. */
const decisionsBodies = (scenario: GatewayScenario): DecisionsRequest[] =>
  scenario.requests
    .filter((request) => request.path === "/v1/systemone")
    .map((request) => request.body as DecisionsRequest);

/** Installs a scenario that answers the given choices per question. */
const useScenario = (
  choices: Readonly<Record<string, string>>,
): Promise<GatewayScenario> =>
  gateway.use({
    decisions: (request) => decisionsResponse(request, { choices }),
  });

/** A Decisions response with hand-built answers, exactly as the API returns them. */
const answerBody = (
  answers: Record<string, unknown>,
): { body: unknown } => ({
  body: {
    answers,
    model: "decision-default",
    provider: "mock-model-gateway",
    usage: { cost: 0 },
  },
});

const choice = (
  answer: string,
): ClassificationAnswerProvenance => ({
  choice: answer,
  confidence: 1,
  probabilities: { [answer]: 1 },
});

describe("classifyForTranslation: one Decisions call for direction + audience + domain", () => {
  it("asks the three questions with the decision-default contract and the raw text as state", async () => {
    const scenario = await useScenario({
      [DIRECTION_QUESTION_KEY]: "en-to-es",
      [AUDIENCE_QUESTION_KEY]: "internal",
      [DOMAIN_QUESTION_KEY]: "devops",
    });

    await classifyForTranslation("some text");

    const bodies = decisionsBodies(scenario);
    expect(bodies).toHaveLength(1);
    const [body] = bodies;

    expect(body!.model).toBe("decision-default");
    // One call, all questions at once, under their wire keys.
    expect(Object.keys(body!.questions!)).toEqual([
      DIRECTION_QUESTION_KEY,
      AUDIENCE_QUESTION_KEY,
      DOMAIN_QUESTION_KEY,
    ]);
    // Every question travels as a closed choice set (the API only answers those).
    for (const question of Object.values(body!.questions!)) {
      expect(question.type).toBe("choice");
      expect(Object.keys(question.criteria!).length).toBeGreaterThan(1);
    }
    expect(body!.questions![DIRECTION_QUESTION_KEY]!.criteria).toEqual({
      "es-to-en": expect.any(String),
      "en-to-es": expect.any(String),
    });
    expect(body!.state).toEqual({ text: "some text" });
  });

  it("maps the answered choices as-is (no confidence gate) and copies the provenance", async () => {
    await useScenario({
      [DIRECTION_QUESTION_KEY]: "en-to-es",
      [AUDIENCE_QUESTION_KEY]: "internal",
      [DOMAIN_QUESTION_KEY]: "devops",
    });

    const result = await classifyForTranslation("some text");

    expect(result.direction).toBe("en-to-es");
    expect(result.audience).toBe("internal");
    expect(result.domain).toBe("devops");
    // Provenance comes from the Decisions response itself, not from the caller.
    expect(result.provenance).toMatchObject({
      modelId: "decision-default",
      provider: "mock-model-gateway",
      costUsd: 0,
      answers: {
        [DIRECTION_QUESTION_KEY]: { choice: "en-to-es" },
        [AUDIENCE_QUESTION_KEY]: { choice: "internal" },
        [DOMAIN_QUESTION_KEY]: { choice: "devops" },
      },
    });
    expect(result.provenance.latencyMs).toEqual(expect.any(Number));
  });

  it("falls back per question on an unknown or missing answer, keeping the valid ones", async () => {
    const scenario = await gateway.use({
      decisions: () =>
        answerBody({
          [DIRECTION_QUESTION_KEY]: {
            type: "choice",
            ...choice("banana"),
          },
          [AUDIENCE_QUESTION_KEY]: {
            type: "choice",
            ...choice("executives"),
          },
          // `domain` is missing entirely.
        }),
    });

    const result = await classifyForTranslation("some text");

    expect(result.direction).toBe(FALLBACK_DIRECTION);
    expect(result.audience).toBe("executives");
    expect(result.domain).toBe(FALLBACK_DOMAIN);
    // The rejected answer is still recorded: provenance never gates.
    expect(result.provenance.answers[DIRECTION_QUESTION_KEY]?.choice).toBe(
      "banana",
    );
    expect(result.provenance.answers[DOMAIN_QUESTION_KEY]).toBeUndefined();
    expect(decisionsBodies(scenario)).toHaveLength(1);
  });

  it("falls back to defaults when the Decisions request fails, marking the provenance unavailable", async () => {
    await gateway.use({
      decisions: () => {
        throw new GatewayScenarioError("decisions unavailable", 500);
      },
    });

    const result = await classifyForTranslation("some text");

    expect(result).toEqual({
      direction: FALLBACK_DIRECTION,
      audience: FALLBACK_AUDIENCE,
      domain: FALLBACK_DOMAIN,
      provenance: { modelId: "unavailable", answers: {} },
    });
  });

  it("falls back to defaults when the answer carries no valid choice", async () => {
    await gateway.use({ decisions: () => answerBody({}) });

    const result = await classifyForTranslation("some text");

    // `decide` rejects an answer with zero valid choices; the classifier turns
    // that into the defaults instead of surfacing an exception.
    expect(result).toMatchObject({
      direction: FALLBACK_DIRECTION,
      audience: FALLBACK_AUDIENCE,
      domain: FALLBACK_DOMAIN,
      provenance: { modelId: "unavailable", answers: {} },
    });
  });
});

describe("classifyForGrammar: one Decisions call for audience + domain", () => {
  it("asks only the two questions the workflow needs", async () => {
    const scenario = await useScenario({
      [AUDIENCE_QUESTION_KEY]: "professionals",
      [DOMAIN_QUESTION_KEY]: "legal",
    });

    await classifyForGrammar("some text");

    const bodies = decisionsBodies(scenario);
    expect(bodies).toHaveLength(1);
    const [body] = bodies;

    expect(body!.model).toBe("decision-default");
    expect(Object.keys(body!.questions!)).toEqual([
      AUDIENCE_QUESTION_KEY,
      DOMAIN_QUESTION_KEY,
    ]);
    expect(body!.state).toEqual({ text: "some text" });
  });

  it("resolves the shared classifications and no direction", async () => {
    await useScenario({
      [AUDIENCE_QUESTION_KEY]: "professionals",
      [DOMAIN_QUESTION_KEY]: "legal",
    });

    const result = await classifyForGrammar("some text");

    expect(result).not.toHaveProperty("direction");
    expect(result.audience).toBe("professionals");
    expect(result.domain).toBe("legal");
    expect(result.provenance.modelId).toBe("decision-default");
  });

  it("degrades to defaults when the Decisions call fails", async () => {
    await gateway.use({
      decisions: () => {
        throw new GatewayScenarioError("decisions unavailable", 500);
      },
    });

    const result = await classifyForGrammar("some text");

    expect(result).toEqual({
      audience: FALLBACK_AUDIENCE,
      domain: FALLBACK_DOMAIN,
      provenance: { modelId: "unavailable", answers: {} },
    });
  });
});

describe("classification trace scope", () => {
  // `inference-kit` derives the ambient scope itself: `chatId` wins over the
  // generic `sessionId`, and the `trace` block (with `ENGLISH_CLASSIFIER_TRACE_NAME`)
  // only travels when tracing is enabled. In the Test Environment it is off, so
  // the observable contract is the session id.
  it("carries the ambient chat id as session_id", async () => {
    const scenario = await useScenario({
      [AUDIENCE_QUESTION_KEY]: "general",
      [DOMAIN_QUESTION_KEY]: "none",
    });

    await runWithTraceContext({ runId: "run-1", chatId: "chat-42" }, () =>
      classifyForGrammar("some text"),
    );

    const [body] = decisionsBodies(scenario);
    expect((body as Record<string, unknown>).session_id).toBe("chat-42");
    expect(body).not.toHaveProperty("trace");
  });
});
