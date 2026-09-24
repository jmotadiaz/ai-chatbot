import type { Decision, DecideOptions } from "inference";
import { isOneOf } from "@/lib/features/chat/mode-routing/guards";
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
 * Wire-format key of this question inside the Decisions API's
 * `questions`/`answers` maps, and the trace name grouping router calls in
 * OpenRouter's observability. Pinned explicitly (the kit's `decide()`
 * defaults both otherwise) so the emitted request is byte-identical to the
 * one the feature-owned adapter sent before `decide` moved into the kit.
 */
export const CHAT_MODE_ROUTING_QUESTION_KEY = "mode";
export const CHAT_MODE_ROUTING_TRACE_NAME = "chat-mode-routing";

const isRoutingOption = (value: unknown): value is RoutingOption =>
  isOneOf(ROUTING_OPTIONS, value);

/**
 * Keeps only the question's own option keys, so an unknown key the provider
 * might echo back cannot leak into the persisted provenance. The kit's
 * `decide()` returns raw, unfiltered `Record<string, number>` probabilities —
 * this filtering is domain-specific (it depends on `ROUTING_OPTIONS`), so it
 * lives here, not in the generic operation.
 */
const pickProbabilities = (
  probabilities: Record<string, number> | undefined,
): Record<string, number> | undefined => {
  if (!probabilities) return undefined;

  const picked: Record<string, number> = {};
  for (const option of ROUTING_OPTIONS) {
    const value = probabilities[option];
    if (typeof value === "number" && Number.isFinite(value)) {
      picked[option] = value;
    }
  }
  return Object.keys(picked).length > 0 ? picked : undefined;
};

/**
 * Real `ChatModeRouterPort`, a thin composition over the kit's generic
 * `decide`: asks the Chat Mode Routing question (by `Model Role`, so a
 * catalog change never touches this feature), maps the answered `choice` to a
 * Resolved Chat Mode, and copies the rest of the provenance as-is.
 *
 * Errors are intentionally left to propagate — `resolveChatMode()` owns the
 * fallback policy and degrades the turn to the neutral branch, so nothing
 * here ever reaches the chat stream as an exception. `decide` already bounds
 * the call with a timeout and defaults `sessionId`/`traceId` from the current
 * trace scope, so this composition only needs to pin the question's key and
 * the trace name; it does not need to know about the rest of the scope.
 */
export const createChatModeRouter = (
  decide: (options: DecideOptions) => Promise<Decision>,
): ChatModeRouterPort => ({
  async route(input: ChatModeRouterInput): Promise<RoutingDecision> {
    const decision = await decide({
      model: "chatModeRouter",
      question: {
        name: CHAT_MODE_ROUTING_QUESTION_KEY,
        instructions: CHAT_MODE_ROUTING_QUESTION.instructions,
        criteria: CHAT_MODE_ROUTING_QUESTION.criteria,
      },
      state: {
        latest_message: input.latestMessage,
        recent_context: input.recentContext,
      },
      scope: { traceName: CHAT_MODE_ROUTING_TRACE_NAME },
    });

    if (!isRoutingOption(decision.choice)) {
      throw new Error(`Unknown chat mode option: ${decision.choice}`);
    }

    return {
      mode: ROUTING_OPTION_TO_MODE[decision.choice],
      reason: decision.choice === "neither" ? "neither" : "routed",
      confidence: decision.confidence,
      probabilities: pickProbabilities(decision.probabilities),
      modelId: decision.modelId,
      provider: decision.provider,
      latencyMs: decision.latencyMs,
      costUsd: decision.costUsd,
    };
  },
});
