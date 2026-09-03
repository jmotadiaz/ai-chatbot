/**
 * Single-pending-queue helpers for the steering-mid-turn flow.
 *
 * The SDK keeps two independent queues (`steering`, `followUp`) with no
 * deduplication. v1 only ever arms ONE plain-text message, so every reader
 * of those queues — the queue-update translator event, the snapshot
 * rehydration path, the queue mutations and the chip-text derivation — goes
 * through these helpers instead of re-filtering inline. The queue-update
 * event stays the source of truth for chip visibility; `firstPendingText`
 * is the single derivation shared by the live event and the rehydrated
 * snapshot so both can never disagree.
 */

export interface PendingQueues {
  steering: string[];
  followUp: string[];
}

export function emptyPendingQueues(): PendingQueues {
  return { steering: [], followUp: [] };
}

/**
 * Defensive string-list read. Non-string entries (malformed payloads, test
 * doubles) are dropped; anything that is not an array reads as empty.
 */
export function stringArrayOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

/**
 * Coerce an unknown clearQueue-shaped payload into owned `PendingQueues`.
 * Always returns fresh arrays, never aliases of the input.
 */
export function pendingQueuesOf(value: unknown): PendingQueues {
  if (!value || typeof value !== "object") return emptyPendingQueues();
  const raw = value as { steering?: unknown; followUp?: unknown };
  return {
    steering: stringArrayOf(raw.steering),
    followUp: stringArrayOf(raw.followUp),
  };
}

/**
 * The armed chip text: the first follow-up entry, else the first steering
 * entry. Follow-up wins because it is the phase the user armed; a promoted
 * message (steering only) stays visible until delivery instead of dropping
 * the chip and unlocking the composer for a second message. First non-blank
 * wins; null when nothing is armed, including malformed input.
 */
export function firstPendingText(
  pending: { steering?: unknown; followUp?: unknown } | null | undefined,
): string | null {
  if (!pending || typeof pending !== "object") return null;
  const first = (value: unknown): string | null => {
    const list = stringArrayOf(value);
    return list.find((entry) => entry.trim().length > 0) ?? null;
  };
  return first(pending.followUp) ?? first(pending.steering);
}

export function isQueueOccupied(pending: PendingQueues): boolean {
  return pending.steering.length > 0 || pending.followUp.length > 0;
}

/**
 * Defensive live read of the Pi session queues. Test doubles and older
 * sessions may lack the getters, and a throwing getter must never fail the
 * caller (snapshot, occupancy guard).
 */
export function readPendingQueues(session: {
  getSteeringMessages?: () => readonly unknown[];
  getFollowUpMessages?: () => readonly unknown[];
}): PendingQueues {
  const read = (fn?: () => readonly unknown[]): string[] => {
    try {
      return stringArrayOf(fn?.call(session));
    } catch {
      return [];
    }
  };
  return {
    steering: read(session.getSteeringMessages),
    followUp: read(session.getFollowUpMessages),
  };
}

export const QUEUE_CONFLICT_CODE = 409;

export const QUEUE_OCCUPIED_MESSAGE =
  "A message is already pending: discard, edit or promote it before queueing another";

/**
 * Thrown by `followUp`/`steer` when a second message would stack on top of
 * the single armed one. The transport maps it to a 409 conflict (not the
 * generic internal error) so direct RPC callers get the same single-pending
 * enforcement as the locked composer.
 */
export class QueueConflictError extends Error {
  readonly code = QUEUE_CONFLICT_CODE;
  constructor(message: string = QUEUE_OCCUPIED_MESSAGE) {
    super(message);
    this.name = "QueueConflictError";
  }
}
