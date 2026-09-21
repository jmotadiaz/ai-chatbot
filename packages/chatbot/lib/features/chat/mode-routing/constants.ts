/**
 * Single source of truth for the routing confidence gate.
 *
 * Below this value the routing decision is discarded and the turn degrades to
 * the neutral branch (`reason: "low_confidence"`). Ticket 03/04 consume this
 * constant; tuning it is an eval decision, not a per-call one.
 */
export const CHAT_MODE_ROUTING_CONFIDENCE_THRESHOLD = 0.7;

/** Budget for one classification call before degrading to `fallback`. */
export const CHAT_MODE_ROUTING_TIMEOUT_MS = 1500;
