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

/**
 * Version of the instructions/criteria below. Bump it whenever they change:
 * the eval dataset is tagged with this value so two criteria revisions stay
 * comparable.
 */
export const CHAT_MODE_ROUTING_QUESTION_VERSION = 2;

export interface ChatModeRoutingQuestion {
  /** Decision prompt sent to Jev. */
  instructions: string;
  /**
   * The `type: "choice"` options: each KEY is an option name the classifier
   * may answer with, and each value describes when that option applies.
   */
  criteria: Record<RoutingOption, string>;
}

/**
 * The single `choice` asked to Jev on every Auto turn (intent routing: cheap,
 * typed question; the routing logic stays in code, see `policy.ts`).
 *
 * The instructions are explicit about the two pieces of state the classifier
 * receives: `latest_message` is the message to classify and `recent_context`
 * is only there to resolve pronouns/references it cannot resolve alone.
 */
export const CHAT_MODE_ROUTING_QUESTION: ChatModeRoutingQuestion = {
  instructions:
    "Classify how the assistant should answer the user's latest message. " +
    "Treat `latest_message` as the message to classify and read " +
    "`recent_context` (the previous turn) only to resolve what a pronoun or " +
    "implicit reference in `latest_message` points to. Pick the single best " +
    "mode and answer with exactly one of the criteria keys. When answering " +
    "well requires citing or verifying external sources, choose `web` over " +
    "`neither`.",
  criteria: {
    ctx7:
      "The message asks for up-to-date documentation of a software library, " +
      "framework, SDK, CLI tool or language API: how something works, its API " +
      "surface, its configuration, or version-specific behavior.",
    web:
      "The message asks for current or externally verifiable information: " +
      "news and current events, prices, releases, availability, " +
      "references/sources to check a claim, the content behind a URL, a " +
      "comparison that depends on the real world, or authoritative external " +
      "documents — official standards, regulations or formal specifications, " +
      "their current edition/status, and where to verify them at the " +
      "issuing source.",
    neither:
      "The message can be answered with general reasoning, knowledge already " +
      "present in the repository or conversation, or plain chat. No library " +
      "documentation is needed and the answer does not have to cite or " +
      "verify external sources.",
  },
};

/** Max characters kept per message of the previous turn. */
export const RECENT_CONTEXT_MAX_CHARS = 500;
