import { describe, expect, it, vi } from "vitest";
import type { GatewayScenario } from "@ai-chatbot/model-gateway-testing";
import { runWithTraceContext } from "tracing";
import { setupGatewayHarness } from "../../../helpers/gateway-harness";
import {
  answerDecision,
  answerDecisionRaw,
  answerDecisionWith,
} from "../../../helpers/gateway-decisions";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";
import {
  CHAT_MODE_ROUTING_QUESTION_KEY,
  CHAT_MODE_ROUTING_TRACE_NAME,
  createChatModeRouter,
} from "@/lib/features/chat/mode-routing/router";
import { CHAT_MODE_ROUTING_QUESTION } from "@/lib/features/chat/mode-routing/questions";
import type { ChatModeRouterInput } from "@/lib/features/chat/mode-routing/types";

/**
 * `createChatModeRouter` as a social unit test (ADR 0013): the router is built
 * over the REAL `inferenceKit.decide` and the REAL SDK/HTTP serialization, and
 * the Decisions answer is served over HTTP by the official gateway toolkit at
 * the MSW seam. No `DecideFn` fake and no `Decision` fixture: the mode mapping,
 * the provenance filtering and the request contract are asserted against what
 * actually left the process (`scenario.requests`) and what came back on the
 * wire.
 *
 * Tracing is the other seam: `decide()` only emits `trace` on the wire when
 * tracing is enabled, so this file turns the ambient tracing flag on (a
 * configuration of the tracing library, not of the AI kit) to pin the trace
 * name the router scopes its call with. The context itself is real
 * (`runWithTraceContext`).
 */
vi.mock("tracing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("tracing")>();
  return { ...actual, isTracingEnabled: () => true };
});

const gateway = setupGatewayHarness();

const router = createChatModeRouter(inferenceKit.decide);

const input: ChatModeRouterInput = {
  latestMessage: "How do I use drizzle-kit?",
  recentContext: "user: hello",
};

/** Decisions request body as the kit serializes it (`POST /v1/systemone`). */
interface RecordedDecisionsBody {
  model?: string;
  questions?: Record<
    string,
    { type?: string; instructions?: string; criteria?: Record<string, string> }
  >;
  state?: Record<string, unknown>;
  session_id?: string;
  trace?: { traceId?: string; traceName?: string };
}

const decisionsBodies = (scenario: GatewayScenario): RecordedDecisionsBody[] =>
  scenario.requests
    .filter((request) => request.path === "/v1/systemone")
    .map((request) => request.body as RecordedDecisionsBody);

/** The consumer's answer for the routing question, rendered by the toolkit. */
const answering = (choice: string) =>
  answerDecision(CHAT_MODE_ROUTING_QUESTION_KEY, choice);

const answeringWith = (choice: string, answer: Record<string, unknown>) =>
  answerDecisionWith(CHAT_MODE_ROUTING_QUESTION_KEY, choice, answer);

const answeringRaw = answerDecisionRaw;

describe("createChatModeRouter over the Gateway HTTP seam", () => {
  it("maps ctx7 to context7/routed and copies the response provenance", async () => {
    const scenario = await gateway.use({ decisions: answering("ctx7") });

    const decision = await router.route(input);

    // The supported option -> Chat Mode mapping.
    expect(decision).toMatchObject({
      mode: "context7",
      reason: "routed",
      // Provenance comes from the Decisions response, not from a fixture.
      confidence: 1,
      probabilities: { ctx7: 1 / 3, web: 1 / 3, neither: 1 / 3 },
      modelId: "decision-default",
      provider: "mock-model-gateway",
      costUsd: 0,
    });
    // Latency is measured, so its value varies: only its presence matters.
    expect(typeof decision.latencyMs).toBe("number");

    expect(decisionsBodies(scenario)).toHaveLength(1);
  });

  it.each([
    { option: "web", mode: "web", reason: "routed" },
    { option: "neither", mode: "neutral", reason: "neither" },
  ])(
    "maps $option to $mode/$reason",
    async ({ option, mode, reason }) => {
      await gateway.use({ decisions: answering(option) });

      await expect(router.route(input)).resolves.toMatchObject({ mode, reason });
    },
  );

  it("drops probability keys outside the question's own options", async () => {
    await gateway.use({
      decisions: answeringWith("ctx7", {
        probabilities: { ctx7: 0.9, web: 0.1, neither: 0, banana: 0.5 },
      }),
    });

    const decision = await router.route(input);

    expect(decision.probabilities).toEqual({ ctx7: 0.9, web: 0.1, neither: 0 });
  });

  it("omits probabilities entirely when none of the question's options are present", async () => {
    await gateway.use({
      decisions: answeringWith("ctx7", { probabilities: { banana: 0.5 } }),
    });

    const decision = await router.route(input);

    expect(decision.probabilities).toBeUndefined();
  });

  it("asks the Chat Mode Routing question with the input as state", async () => {
    const scenario = await gateway.use({ decisions: answering("ctx7") });

    await router.route(input);

    const [body] = decisionsBodies(scenario);
    expect(body).toBeDefined();
    // The single Default Model Contract for decisions.
    expect(body!.model).toBe("decision-default");
    // The question key is the wire key the feature pinned: `mode`.
    expect(Object.keys(body!.questions ?? {})).toEqual([
      CHAT_MODE_ROUTING_QUESTION_KEY,
    ]);
    expect(body!.questions?.[CHAT_MODE_ROUTING_QUESTION_KEY]).toEqual({
      type: "choice",
      instructions: CHAT_MODE_ROUTING_QUESTION.instructions,
      criteria: CHAT_MODE_ROUTING_QUESTION.criteria,
    });
    // The Router Input travels as the question's state.
    expect(body!.state).toEqual({
      latest_message: input.latestMessage,
      recent_context: input.recentContext,
    });
  });

  it("scopes the call with the ambient session and the feature's trace name", async () => {
    const scenario = await gateway.use({ decisions: answering("ctx7") });

    await runWithTraceContext(
      { runId: "trace-run-1", chatId: "chat-session-1" },
      () => router.route(input),
    );

    const [body] = decisionsBodies(scenario);
    expect(body!.session_id).toBe("chat-session-1");
    expect(body!.trace).toEqual({
      traceId: "trace-run-1",
      traceName: CHAT_MODE_ROUTING_TRACE_NAME,
    });
  });

  it("rejects an unknown choice instead of guessing a mode", async () => {
    await gateway.use({
      decisions: answeringRaw({
        answers: {
          [CHAT_MODE_ROUTING_QUESTION_KEY]: {
            type: "choice",
            choice: "banana",
            confidence: 1,
          },
        },
        model: "decision-default",
      }),
    });

    await expect(router.route(input)).rejects.toThrow(
      /Unknown chat mode option: banana/,
    );
  });

  it("rejects a response without a usable answer instead of guessing a mode", async () => {
    await gateway.use({
      decisions: answeringRaw({
        answers: {
          some_other_question: { type: "choice", choice: "ctx7", confidence: 1 },
        },
        model: "decision-default",
      }),
    });

    // `decide()` only keeps answers to the questions it asked, so an answer for
    // another question is not evidence for this one.
    await expect(router.route(input)).rejects.toThrow(
      /Unexpected Decisions answer: missing/,
    );
  });

  it("propagates a Decisions transport error (fallback policy is the consumer's)", async () => {
    await gateway.use({
      decisions: () => {
        throw new Error("decisions backend down");
      },
    });

    await expect(router.route(input)).rejects.toThrow(
      /Decisions request failed: 500/,
    );
  });

  it("propagates a malformed Decisions payload", async () => {
    await gateway.use({
      decisions: answeringRaw({
        answers: {
          [CHAT_MODE_ROUTING_QUESTION_KEY]: { type: "text", text: "ctx7" },
        },
        model: "decision-default",
      }),
    });

    await expect(router.route(input)).rejects.toThrow(
      /Unexpected Decisions answer: text/,
    );
  });
});

/**
 * The declared choice lists stay in the consumer: the toolkit is handed the
 * option name, it does not know what `ctx7` means.
 */
describe("routing definitions stay in the chatbot consumer", () => {
  it("sends the chatbot's own criteria keys and reads the chosen one back", async () => {
    const scenario = await gateway.use({ decisions: answering("neither") });

    const decision = await router.route(input);

    const [body] = decisionsBodies(scenario);
    expect(Object.keys(body!.questions?.[CHAT_MODE_ROUTING_QUESTION_KEY]!.criteria ?? {})).toEqual([
      "ctx7",
      "web",
      "neither",
    ]);
    expect(decision.mode).toBe("neutral");
  });
});
