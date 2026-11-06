import type { SessionManager } from "@earendil-works/pi-coding-agent";
import { IdDeduper, userMessageId } from "../agui/message-ids";

/** Location of a user Message in the Pi session tree. */
export interface UserMessageEntry {
  entryId: string;
  parentId: string | null;
}

/**
 * Map the id the Coding Agent UI renders for a user Message back to the Pi
 * session entry that holds it.
 *
 * The client sends the AG-UI id it already renders, which for a Message the
 * User typed is the `clientMessageId` stamped on `message_end` (and
 * round-tripped through the session file) and otherwise the derived
 * `u-<timestamp>`. The same `IdDeduper` the AG-UI converter runs is applied
 * here, in the same active-path order, so both sides derive identical ids.
 *
 * The search is restricted to `buildContextEntries()`, the active and
 * compaction-aware path: a Message Edit must never rewind into an Abandoned
 * Branch, whose messages are still in the session file but outside the
 * Session.
 */
export function resolveUserMessageEntry(
  manager: SessionManager,
  messageId: string,
): UserMessageEntry | undefined {
  const idDeduper = new IdDeduper();
  for (const entry of manager.buildContextEntries()) {
    if (entry.type !== "message" || entry.message.role !== "user") continue;
    const message = entry.message as { timestamp?: unknown; clientMessageId?: unknown };
    const baseId =
      typeof message.clientMessageId === "string"
        ? message.clientMessageId
        : typeof message.timestamp === "number"
          ? userMessageId(message.timestamp)
          : undefined;
    if (baseId === undefined) continue;
    if (idDeduper.dedupe(baseId) === messageId) {
      return { entryId: entry.id, parentId: entry.parentId };
    }
  }
  return undefined;
}
