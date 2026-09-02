/**
 * Deterministic id derivation for Pi -> AG-UI message translation.
 *
 * Pi messages carry no id, but every Pi message has a stable `timestamp`
 * (assigned once at message creation and never rewritten — verified against
 * @earendil-works/pi-agent-core and @earendil-works/pi-ai: the assistant
 * message object is created once with `timestamp: Date.now()` and the same
 * object reference is mutated and re-emitted through `message_start`,
 * `message_update`, and the final `message_end`/`done` event).
 *
 * Deriving ids from that timestamp (and from real tool-call ids, which are
 * already stable) lets both the live translator and the history-load path
 * compute THE SAME id for the same Pi message, instead of each inventing its
 * own incrementing counter that collides across runs / reconnects / reloads.
 */

/** Id for an assistant message, derived from its Pi `timestamp`. */
export function assistantMessageId(timestamp: number): string {
  return `a-${timestamp}`;
}

/** Id for the reasoning ("thinking") block attached to an assistant message. */
export function reasoningMessageId(assistantId: string): string {
  return `${assistantId}-reason`;
}

/** Id for a user message, derived from its Pi `timestamp`. */
export function userMessageId(timestamp: number): string {
  return `u-${timestamp}`;
}

/** Id for a tool result message, derived from the real, stable tool call id. */
export function toolResultMessageId(toolCallId: string): string {
  return `tool-result-${toolCallId}`;
}

/**
 * Disambiguates repeated base ids deterministically.
 *
 * Two Pi messages of the same role can share a millisecond-resolution
 * timestamp. Given the same sequence of base ids, `dedupe` always returns
 * the same sequence of output ids: the base id itself the first time it's
 * seen, then `${base}-2`, `${base}-3`, ... on each subsequent occurrence.
 */
export class IdDeduper {
  private readonly seen = new Map<string, number>();

  dedupe(baseId: string): string {
    const count = (this.seen.get(baseId) ?? 0) + 1;
    this.seen.set(baseId, count);
    return count === 1 ? baseId : `${baseId}-${count}`;
  }
}
