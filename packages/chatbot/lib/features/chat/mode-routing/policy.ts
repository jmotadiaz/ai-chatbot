import { CHAT_MODE_ROUTING_CONFIDENCE_THRESHOLD } from "@/lib/features/chat/mode-routing/constants";
import { isOneOf } from "@/lib/features/chat/mode-routing/guards";
import {
  ROUTING_OPTION_TO_MODE,
  type RoutingOption,
} from "@/lib/features/chat/mode-routing/questions";
import type {
  ChatModeRoutingReason,
  ResolvedChatMode,
  RoutingDecision,
} from "@/lib/features/chat/mode-routing/types";

/** Final mode + reason a classifier answer resolves to. */
export interface ResolvedChatModeDecision {
  mode: ResolvedChatMode;
  reason: ChatModeRoutingReason;
}

/**
 * Neutral, tool-less decision recorded whenever the classifier answer cannot
 * be trusted (no answer, transport error, malformed payload).
 */
export const FALLBACK_CHAT_MODE_DECISION: RoutingDecision = {
  mode: "neutral",
  reason: "fallback",
  modelId: "unavailable",
};

/**
 * Untrusted classifier answer: the adapter may hand over either an already
 * resolved mode or the raw question option (`ctx7` / `neither`).
 */
export type RoutingDecisionInput = Omit<RoutingDecision, "mode"> & {
  mode: ResolvedChatMode | RoutingOption;
};

const RESOLVED_CHAT_MODES: readonly ResolvedChatMode[] = [
  "context7",
  "web",
  "neutral",
];

const isResolvedChatMode = (value: unknown): value is ResolvedChatMode =>
  isOneOf(RESOLVED_CHAT_MODES, value);

/** Question option (or resolved mode) → resolved mode. */
const toResolvedMode = (value: unknown): ResolvedChatMode | undefined =>
  isResolvedChatMode(value)
    ? value
    : (ROUTING_OPTION_TO_MODE as Record<string, ResolvedChatMode>)[
        value as string
      ];

/**
 * Shape guard for the answer coming out of the adapter: it must name a known
 * mode (resolved or raw option) and identify the model that produced it
 * (provenance is part of the persisted metadata contract).
 */
export const isRoutingDecision = (
  value: unknown,
): value is RoutingDecisionInput => {
  if (typeof value !== "object" || value === null) return false;

  const { mode, modelId } = value as { mode?: unknown; modelId?: unknown };

  return (
    toResolvedMode(mode) !== undefined &&
    typeof modelId === "string" &&
    modelId.length > 0
  );
};

const hasConfidence = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Converts a classifier answer into the mode the turn is actually answered
 * with. Pure and total: it walks every branch of the fallback policy and never
 * throws, so a broken router can only degrade the turn, never break the chat.
 *
 * Policy table:
 * - invalid answer (not a decision, unknown mode, no modelId) → `neutral` / `fallback`
 * - `neither` (or an already-resolved `neutral`) → `neutral` / `neither`
 * - `confidence` missing/non-finite, or below
 *   `CHAT_MODE_ROUTING_CONFIDENCE_THRESHOLD` → `neutral` / `low_confidence`
 *   (a valid answer that merely lacks a usable score did not fail to route; it
 *   just cannot pass the confidence gate)
 * - confident `ctx7`/`context7`/`web` → that mode / `routed`
 */
export const decideResolvedMode = (decision: unknown): ResolvedChatModeDecision => {
  if (!isRoutingDecision(decision)) {
    return { mode: "neutral", reason: "fallback" };
  }

  const mode = toResolvedMode(decision.mode)!;

  if (mode === "neutral") {
    return { mode, reason: "neither" };
  }

  if (
    !hasConfidence(decision.confidence) ||
    decision.confidence < CHAT_MODE_ROUTING_CONFIDENCE_THRESHOLD
  ) {
    return { mode: "neutral", reason: "low_confidence" };
  }

  return { mode, reason: "routed" };
};
