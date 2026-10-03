import type { Decision, DecisionAnswer } from "inference";

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
 * - `routed`: the classifier answered with a tool-backed mode; it is applied
 *   as-is (no confidence gate).
 * - `neither`: the classifier decided no tool is needed → neutral branch.
 * - `low_confidence`: legacy reason, no longer emitted since the confidence
 *   gate was retired. Kept so messages persisted before the removal still
 *   decode and render.
 * - `fallback`: timeout, transport error or invalid answer → neutral.
 */
export type ChatModeRoutingReason =
  | "routed"
  | "neither"
  | "low_confidence"
  | "fallback";

/**
 * Raw answer of the classifier, before the fallback policy is applied: the
 * kit's generic provenance (the answered question's `DecisionAnswer` —
 * choice, confidence, probabilities — plus the per-call `Decision` fields,
 * see `inference`) and what the Chat Mode Router resolved it to. Carries no
 * `RoutingOption` on purpose (that would recreate the former cycle with
 * `questions.ts`, which only imports from this file, never the other way).
 *
 * `latencyMs` widens back to optional here: a synthetic fallback decision
 * (`FALLBACK_CHAT_MODE_DECISION`, see `policy.ts`) never actually called a
 * provider, so it has nothing to time.
 */
export interface RoutingDecision
  extends Omit<DecisionAnswer, "choice">,
    Omit<Decision, "answers" | "latencyMs"> {
  mode: ResolvedChatMode;
  reason: ChatModeRoutingReason;
  latencyMs?: number;
}

/**
 * Provenance persisted in `Message.metadata.chatModeRouting` and rendered next
 * to the assistant message. `requested` is always `"auto"` because routing only
 * happens when the chat is in Auto. There is no confidence gate: `mode` is
 * whatever Jev decided (`neither` maps to the internal `neutral` branch) and
 * `confidence` is informational provenance only.
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
 * this port, so tests can inject a deterministic implementation and the
 * OpenRouter/Jev adapter can be swapped in behind it.
 */
export interface ChatModeRouterPort {
  route(input: ChatModeRouterInput): Promise<RoutingDecision>;
}
