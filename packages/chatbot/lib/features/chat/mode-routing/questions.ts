import type { ResolvedChatMode } from "@/lib/features/chat/mode-routing/types";

/**
 * Options offered to the classifier. `neither` is not a Chat Mode: it maps to
 * the internal neutral branch.
 */
export const ROUTING_OPTIONS = ["ctx7", "web", "neither"] as const;
export type RoutingOption = (typeof ROUTING_OPTIONS)[number];

/** Classifier option → resolved mode. */
export const ROUTING_OPTION_TO_MODE: Record<RoutingOption, ResolvedChatMode> = {
  ctx7: "context7",
  web: "web",
  neither: "neutral",
};

export interface ChatModeRoutingQuestion {
  /** Decision prompt sent to Jev. */
  prompt: string;
  /** Ordered options the classifier may choose from. */
  options: readonly RoutingOption[];
}

/**
 * Shape of the single `choice` asked to Jev.
 *
 * Placeholder: ticket 04 replaces `prompt` with the real criteria (software
 * docs → ctx7, current/verifiable external info → web, otherwise → neither)
 * and wires it to the Decisions API adapter.
 */
export const CHAT_MODE_ROUTING_QUESTION: ChatModeRoutingQuestion = {
  // TODO(04): real Jev criteria (intent routing / speculative fan-out).
  prompt:
    "Classify the latest user message: ctx7 (software library/framework docs), " +
    "web (current or verifiable external information), neither (no tool needed).",
  options: ROUTING_OPTIONS,
};

/** Max characters kept per message of the previous turn. */
export const RECENT_CONTEXT_MAX_CHARS = 500;
