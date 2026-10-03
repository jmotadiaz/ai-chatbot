"use client";

import type { BaseEvent } from "@ag-ui/client";
import { isQueueUpdateCustom, type AguiEvent } from "coding-agent/agui/event";
import type { PendingQueues } from "./types";

export type { PendingQueues };

/**
 * Shared pending-queue helpers for the steering-mid-turn flow (chatbot
 * side). Mirrors the worker's `pending-queues.ts` over the same JSON shape:
 * the queue-update event and the snapshot are the sources of truth for the
 * raw queues, and every surface (chip, steering bubble) derives its own text
 * from that one value.
 */

/** Defensive string-list read: non-strings dropped, non-arrays read as empty. */
export function stringArrayOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

/** A fresh, empty pair of queues: the "nothing armed" store value. */
export function emptyPendingQueues(): PendingQueues {
  return { steering: [], followUp: [] };
}

/** Coerce an unknown queue-shaped payload into owned `PendingQueues`. */
export function pendingQueuesOf(value: unknown): PendingQueues {
  if (!value || typeof value !== "object") return emptyPendingQueues();
  const raw = value as { steering?: unknown; followUp?: unknown };
  return {
    steering: stringArrayOf(raw.steering),
    followUp: stringArrayOf(raw.followUp),
  };
}

/**
 * The first non-blank entry of a single raw queue, or null when that queue
 * holds nothing visible. Each surface derives its own text from its own
 * queue (chip from `followUp`, transcript bubble from `steering`), so the
 * dispatch rule stays exclusive without a second source of truth.
 */
export function firstQueueText(queue: unknown): string | null {
  return stringArrayOf(queue).find((entry) => entry.trim().length > 0) ?? null;
}

/**
 * The armed chip text: the first follow-up entry, else the first steering
 * entry. Follow-up wins because it is the phase the user armed; a promoted
 * message (steering only) stays visible — and the composer stays locked to
 * chip-plus-cancel — until delivery instead of dropping the chip and
 * admitting a second message. First non-blank wins; null when nothing is
 * armed, including malformed input.
 */
export function pendingChipText(
  pending: { steering?: unknown; followUp?: unknown } | null | undefined,
): string | null {
  if (!pending || typeof pending !== "object") return null;
  return firstQueueText(pending.followUp) ?? firstQueueText(pending.steering);
}

/**
 * The raw queues from a queue-update CUSTOM event, stored verbatim so every
 * surface derives from the same value. Non-queue events (and malformed
 * values) return undefined so the caller leaves its state untouched; empty
 * queues come back as empty queues, which clears whatever was armed (e.g.
 * after delivery).
 */
export function pendingQueuesFromEvent(event: BaseEvent): PendingQueues | undefined {
  const aguiEvent = event as unknown as AguiEvent;
  if (!isQueueUpdateCustom(aguiEvent)) return undefined;
  const value = aguiEvent.value;
  if (!value || typeof value !== "object") return undefined;
  return pendingQueuesOf(value);
}

export interface MidTurnSelection {
  skillCount: number;
  commentCount: number;
  fileCount: number;
}

/**
 * Client-side guard for mid-turn sends (US8): skills, file comments and
 * file attachments never travel with queue operations (plain text v1), and
 * the composer disables those sources while a turn runs — but a selection
 * armed before the run started survives. Returns the precise visible error
 * when anything non-text is still selected so the caller can surface it
 * with the draft preserved and WITHOUT calling the worker (which would
 * reject late). Text-level commands (`/skill:…`, `/…`) stay in the text and
 * are rejected worker-side with its own precise message, now propagated
 * verbatim by the queue routes instead of wrapped in a generic status.
 */
export function midTurnBlockReason(selection: MidTurnSelection): string | null {
  if (selection.skillCount > 0) {
    return "Skills cannot be queued while a turn is running (plain text only)";
  }
  if (selection.commentCount > 0) {
    return "File comments cannot be queued while a turn is running (plain text only)";
  }
  if (selection.fileCount > 0) {
    return "Attachments cannot be queued while a turn is running (plain text only)";
  }
  return null;
}
