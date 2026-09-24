import type { DecisionsChoiceAnswer } from "@openrouter/sdk/models";
import { getTraceContext, isTracingEnabled } from "tracing";
import {
  DECISION_MODELS,
  DECISION_ROLES,
  type DecisionModelId,
  type DecisionRole,
} from "models";
import type {
  Decision,
  DecideOptions,
  DecisionScope,
  DecisionsClients,
} from "./types";

/** Key of the single `choice` question this operation ever asks. Callers never see it: it is purely a wire-format detail of the Decisions API request/response maps. */
const DECISION_QUESTION_KEY = "decision";

/** Budget for one decide() call: bounds each SDK attempt and the whole call (see the double-bound comment below). Same value every decision shared before this moved into the kit. */
const DECIDE_TIMEOUT_MS = 1500;

/** The SDK caps `session_id` at 256 characters. */
const SESSION_ID_MAX_CHARS = 256;

const catalogById = new Map<DecisionModelId, (typeof DECISION_MODELS)[number]>(
  DECISION_MODELS.map((entry) => [entry.id, entry]),
);

function resolveDecisionEntry(model: DecisionModelId | DecisionRole) {
  const id =
    (DECISION_ROLES as Record<string, DecisionModelId>)[model] ??
    (model as DecisionModelId);
  const entry = catalogById.get(id);
  if (!entry) {
    throw new Error(`Decision model "${model}" not found in DECISION_MODELS`);
  }
  return entry;
}

/**
 * Trace scope defaults to the ambient trace context when the caller doesn't
 * pass one explicitly — same convention the chat-mode-routing adapter used
 * before this moved into the kit (prefers `chatId` over the generic
 * `sessionId` as the grouping key).
 */
function defaultScope(): DecisionScope {
  const context = getTraceContext();
  if (!context) return {};

  return {
    sessionId: context.chatId ?? context.sessionId,
    traceId: isTracingEnabled() ? context.runId : undefined,
  };
}

const isChoiceAnswer = (value: unknown): value is DecisionsChoiceAnswer =>
  typeof value === "object" &&
  value !== null &&
  (value as { type?: unknown }).type === "choice";

/**
 * Builds `decide(options)`: sends one `type: "choice"` question through the
 * Decisions API of whatever provider `options.model` (a Decision catalog id
 * or Model Role) resolves to.
 *
 * The call is bounded by `DECIDE_TIMEOUT_MS`: `timeoutMs` bounds each SDK
 * attempt and the `signal` bounds the whole call, so the SDK's built-in 5XX
 * backoff can never outlive the decision budget. `sessionId`/`traceId`
 * default from the current trace scope when `options.scope` is not passed.
 * Errors propagate — the fallback policy belongs to the caller (e.g. the Chat
 * Mode Router's `resolveChatMode`).
 */
export function createDecideResolver(
  clients: DecisionsClients,
): (options: DecideOptions) => Promise<Decision> {
  return async (options: DecideOptions): Promise<Decision> => {
    const entry = resolveDecisionEntry(options.model);
    const client = clients[entry.provider.kind]();
    const scope = options.scope ?? defaultScope();

    const startedAt = Date.now();
    const response = await client.alpha.decisions.create(
      {
        decisionsRequest: {
          model: entry.provider.modelId,
          questions: {
            [DECISION_QUESTION_KEY]: {
              type: "choice",
              instructions: options.question.instructions,
              criteria: { ...options.question.criteria },
            },
          },
          state: options.state,
          sessionId: scope.sessionId?.slice(0, SESSION_ID_MAX_CHARS),
          trace: scope.traceId
            ? { traceId: scope.traceId, traceName: String(options.model) }
            : undefined,
        },
      },
      {
        timeoutMs: DECIDE_TIMEOUT_MS,
        signal: AbortSignal.timeout(DECIDE_TIMEOUT_MS),
      },
    );
    const latencyMs = Date.now() - startedAt;

    const answer = response.answers[DECISION_QUESTION_KEY];
    if (!isChoiceAnswer(answer)) {
      const kind =
        answer && typeof answer === "object" && "type" in answer
          ? String((answer as { type: unknown }).type)
          : "missing";
      throw new Error(`Unexpected Decisions answer: ${kind}`);
    }

    return {
      choice: answer.choice,
      confidence: answer.confidence,
      probabilities: answer.probabilities,
      modelId: response.model,
      provider: response.provider,
      latencyMs,
      costUsd: response.usage.cost,
    };
  };
}
