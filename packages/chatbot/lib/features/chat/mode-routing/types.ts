import type { RoutingOption } from "@/lib/features/chat/mode-routing/questions";

/**
 * Mode the answer is actually produced with.
 *
 * `neutral` is internal (no tools, plain reasoning) and is NEVER a selectable
 * Chat Mode: it is not part of `CHAT_MODES` nor of the `chat_mode` pgEnum.
 */
export type ResolvedChatMode = "context7" | "web" | "neutral";

/**
 * Why the router settled on `mode`.
 *
 * - `routed`: the classifier answered with a tool-backed mode and passed the
 *   confidence gate.
 * - `neither`: the classifier decided no tool is needed → neutral branch.
 * - `low_confidence`: classifier answered below the confidence gate, or its
 *   answer carried no usable score → neutral.
 * - `fallback`: timeout, transport error or invalid answer → neutral.
 */
export type ChatModeRoutingReason =
  | "routed"
  | "neither"
  | "low_confidence"
  | "fallback";

/** Raw answer of the classifier, before the fallback policy is applied. */
export interface RoutingDecision {
  mode: ResolvedChatMode;
  reason: ChatModeRoutingReason;
  confidence?: number;
  probabilities?: Partial<Record<RoutingOption, number>>;
  modelId: string;
  provider?: string;
  latencyMs?: number;
  /** Cost of the routing call in USD, when the provider reports it. */
  costUsd?: number;
}

/**
 * Provenance persisted in `Message.metadata.chatModeRouting` and rendered next
 * to the assistant message. `requested` is always `"auto"` because routing only
 * happens when the chat is in Auto.
 */
export interface ChatModeRoutingMetadata extends RoutingDecision {
  requested: "auto";
}

/**
 * Classifier input. `recentContext` carries the previous turn so pronoun-only
 * follow-ups ("¿y eso cómo se hace?") can be resolved.
 */
export interface ChatModeRouterInput {
  latestMessage: string;
  recentContext: string;
}

/**
 * Highest-level seam of the feature: the rest of the chat pipeline only knows
 * this port, so tests can inject a deterministic implementation and ticket 04
 * can plug the OpenRouter/Jev adapter behind it.
 */
export interface ChatModeRouterPort {
  route(input: ChatModeRouterInput): Promise<RoutingDecision>;
}
