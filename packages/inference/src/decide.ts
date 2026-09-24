import type { DecisionsChoiceAnswer } from "@openrouter/sdk/models";
import { getTraceContext, isTracingEnabled } from "tracing";
import {
  DECISION_MODELS,
  DECISION_ROLES,
  resolveCatalogEntry,
  type DecisionModelCatalogEntry,
  type DecisionModelId,
  type DecisionRole,
} from "models";
import type {
  Decision,
  DecideOptions,
  DecisionsClients,
} from "./types";

/** Default key of the single `choice` question this operation asks, when `question.name` is not set. */
const DEFAULT_DECISION_QUESTION_NAME = "decision";

/** Budget for one decide() call: bounds each SDK attempt and the whole call (see the double-bound comment below). Same value every decision shared before this moved into the kit. */
const DECIDE_TIMEOUT_MS = 1500;

/** The SDK caps `session_id` at 256 characters. */
const SESSION_ID_MAX_CHARS = 256;

const catalogById = new Map<DecisionModelId, DecisionModelCatalogEntry>(
  DECISION_MODELS.map((entry) => [entry.id, entry]),
);

function resolveDecisionEntry(model: DecisionModelId | DecisionRole) {
  return resolveCatalogEntry<DecisionModelId, DecisionModelCatalogEntry, DecisionRole>(
    catalogById,
    model,
    { kind: "Decision model", catalogName: "DECISION_MODELS" },
    DECISION_ROLES,
  ).entry;
}

/**
 * The ambient trace scope (`sessionId`/`traceId` only — `traceName` has no
 * ambient source, see `DecisionScope`), same convention the chat-mode-routing
 * adapter used before this moved into the kit (prefers `chatId` over the
 * generic `sessionId` as the grouping key).
 */
function ambientScope(): { sessionId?: string; traceId?: string } {
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
 * backoff can never outlive the decision budget. Every `scope` field falls
 * back independently to the ambient trace context when the caller doesn't
 * set it — passing a partial (or empty) `scope` never blocks the fallback
 * for the fields it leaves out. `traceName` defaults to `String(options.model)`
 * (no ambient source for it). Errors propagate — the fallback policy belongs
 * to the caller (e.g. the Chat Mode Router's `resolveChatMode`).
 */
export function createDecideResolver(
  clients: DecisionsClients,
): (options: DecideOptions) => Promise<Decision> {
  return async (options: DecideOptions): Promise<Decision> => {
    const entry = resolveDecisionEntry(options.model);
    const client = clients[entry.provider.kind]();
    const questionName = options.question.name ?? DEFAULT_DECISION_QUESTION_NAME;
    const ambient = ambientScope();
    const sessionId = (options.scope?.sessionId ?? ambient.sessionId)?.slice(
      0,
      SESSION_ID_MAX_CHARS,
    );
    const traceId = options.scope?.traceId ?? ambient.traceId;
    const traceName = options.scope?.traceName ?? String(options.model);

    const startedAt = Date.now();
    const response = await client.alpha.decisions.create(
      {
        decisionsRequest: {
          model: entry.provider.modelId,
          questions: {
            [questionName]: {
              type: "choice",
              instructions: options.question.instructions,
              criteria: { ...options.question.criteria },
            },
          },
          state: options.state,
          sessionId,
          trace: traceId ? { traceId, traceName } : undefined,
        },
      },
      {
        timeoutMs: DECIDE_TIMEOUT_MS,
        signal: AbortSignal.timeout(DECIDE_TIMEOUT_MS),
      },
    );
    const latencyMs = Date.now() - startedAt;

    const answer = response.answers[questionName];
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
