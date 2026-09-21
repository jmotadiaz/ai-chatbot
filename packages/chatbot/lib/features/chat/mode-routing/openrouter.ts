import { OpenRouter } from "@openrouter/sdk";
import type {
  DecisionsChoiceAnswer,
  DecisionsRequest,
} from "@openrouter/sdk/models";
import { config } from "config";
import { getTraceContext, isTracingEnabled } from "tracing";
import { CHAT_MODE_ROUTING_TIMEOUT_MS } from "@/lib/features/chat/mode-routing/constants";
import {
  CHAT_MODE_ROUTING_QUESTION,
  ROUTING_OPTIONS,
  ROUTING_OPTION_TO_MODE,
  type RoutingOption,
} from "@/lib/features/chat/mode-routing/questions";
import type {
  ChatModeRouterInput,
  ChatModeRouterPort,
  RoutingDecision,
} from "@/lib/features/chat/mode-routing/types";

/**
 * Jev 1.13 (TypeSafe System One) is only reachable through the Decisions API,
 * so this is the model alias the request asks for. The response echoes the
 * dated id (`typesafe/jev-1.13-YYYYMMDD`) and that resolved id is what gets
 * persisted as provenance.
 */
export const OPENROUTER_CHAT_MODE_ROUTING_MODEL = "typesafe/jev-1.13";

/** Key of the single `choice` question inside `questions` / `answers`. */
export const CHAT_MODE_ROUTING_QUESTION_KEY = "mode";

/** Trace name grouping router calls in OpenRouter's observability. */
export const CHAT_MODE_ROUTING_TRACE_NAME = "chat-mode-routing";

/** The SDK caps `session_id` at 256 characters. */
const SESSION_ID_MAX_CHARS = 256;

/**
 * Only the `.alpha.decisions.create` surface is used; keeping the dependency
 * structural lets the contract test inject a real `OpenRouter` client wired to
 * a canned fetcher.
 */
type DecisionsClient = Pick<OpenRouter, "alpha">;

export interface OpenRouterChatModeRouterOptions {
  /** Test seam: client pointed at an in-memory fetcher (never the network). */
  client?: DecisionsClient;
}

let defaultClient: OpenRouter | undefined;

/**
 * Lazily built real client. The API key is resolved through `config` (never
 * `process.env`) and re-read on every call, so a missing key is reported as an
 * ordinary routing failure instead of a module-load crash.
 */
const getDefaultClient = (): OpenRouter => {
  if (!defaultClient) {
    defaultClient = new OpenRouter({
      apiKey: async () => {
        const apiKey = config.openRouterApiKey();
        if (!apiKey) {
          throw new Error(
            "OPENROUTER_API_KEY is not configured; cannot route Auto chat mode",
          );
        }
        return apiKey;
      },
    });
  }
  return defaultClient;
};

const isRoutingOption = (value: unknown): value is RoutingOption =>
  typeof value === "string" &&
  (ROUTING_OPTIONS as readonly string[]).includes(value);

/** Session/trace ids for one routing call, taken from the current trace scope. */
const resolveRoutingScope = (): { sessionId?: string; traceId?: string } => {
  const context = getTraceContext();
  if (!context) return {};

  return {
    sessionId: context.chatId ?? context.sessionId,
    traceId: isTracingEnabled() ? context.runId : undefined,
  };
};

/**
 * Builds the Decisions API payload: one `choice` question whose criteria keys
 * are the routing options, and the classifier state.
 *
 * `state` carries only text (the latest user message plus the previous turn);
 * attachments (`textFiles`) are deliberately excluded.
 */
export const buildChatModeDecisionsRequest = (
  input: ChatModeRouterInput,
  scope: { sessionId?: string; traceId?: string } = {},
): DecisionsRequest => ({
  model: OPENROUTER_CHAT_MODE_ROUTING_MODEL,
  questions: {
    [CHAT_MODE_ROUTING_QUESTION_KEY]: {
      type: "choice",
      instructions: CHAT_MODE_ROUTING_QUESTION.instructions,
      criteria: { ...CHAT_MODE_ROUTING_QUESTION.criteria },
    },
  },
  state: {
    latest_message: input.latestMessage,
    recent_context: input.recentContext,
  },
  sessionId: scope.sessionId?.slice(0, SESSION_ID_MAX_CHARS),
  trace: scope.traceId
    ? { traceId: scope.traceId, traceName: CHAT_MODE_ROUTING_TRACE_NAME }
    : undefined,
});

const isChoiceAnswer = (value: unknown): value is DecisionsChoiceAnswer =>
  typeof value === "object" &&
  value !== null &&
  (value as { type?: unknown }).type === "choice";

/** Keeps only the options of the question, so unknown keys cannot leak. */
const pickProbabilities = (
  probabilities: Record<string, number> | undefined,
): Partial<Record<RoutingOption, number>> | undefined => {
  if (!probabilities) return undefined;

  const picked: Partial<Record<RoutingOption, number>> = {};
  for (const option of ROUTING_OPTIONS) {
    const value = probabilities[option];
    if (typeof value === "number" && Number.isFinite(value)) {
      picked[option] = value;
    }
  }
  return Object.keys(picked).length > 0 ? picked : undefined;
};

/**
 * Real `ChatModeRouterPort` backed by Jev 1.13 over the OpenRouter Decisions
 * API.
 *
 * The call is bounded by `CHAT_MODE_ROUTING_TIMEOUT_MS`: `timeoutMs` bounds
 * each SDK attempt and the signal bounds the whole call, so the SDK's built-in
 * 5XX backoff can never outlive the routing budget. Errors are intentionally
 * thrown — `resolveChatMode()` owns the fallback policy and degrades the turn
 * to the neutral branch, so nothing here ever reaches the chat stream as an
 * exception.
 */
export const createOpenRouterChatModeRouter = (
  options: OpenRouterChatModeRouterOptions = {},
): ChatModeRouterPort => ({
  async route(input: ChatModeRouterInput): Promise<RoutingDecision> {
    const client = options.client ?? getDefaultClient();
    const decisionsRequest = buildChatModeDecisionsRequest(
      input,
      resolveRoutingScope(),
    );

    const startedAt = Date.now();
    const response = await client.alpha.decisions.create(
      { decisionsRequest },
      {
        timeoutMs: CHAT_MODE_ROUTING_TIMEOUT_MS,
        signal: AbortSignal.timeout(CHAT_MODE_ROUTING_TIMEOUT_MS),
      },
    );
    const latencyMs = Date.now() - startedAt;

    const answer = response.answers[CHAT_MODE_ROUTING_QUESTION_KEY];
    if (!isChoiceAnswer(answer)) {
      const kind =
        answer && typeof answer === "object" && "type" in answer
          ? String((answer as { type: unknown }).type)
          : "missing";
      throw new Error(
        `Unexpected Decisions answer for "${CHAT_MODE_ROUTING_QUESTION_KEY}": ${kind}`,
      );
    }

    if (!isRoutingOption(answer.choice)) {
      throw new Error(`Unknown chat mode option: ${answer.choice}`);
    }

    return {
      mode: ROUTING_OPTION_TO_MODE[answer.choice],
      reason: answer.choice === "neither" ? "neither" : "routed",
      confidence: answer.confidence,
      probabilities: pickProbabilities(answer.probabilities),
      modelId: response.model,
      provider: response.provider,
      latencyMs,
    };
  },
});
