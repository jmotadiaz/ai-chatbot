"use client";

import type { BaseEvent } from "@ag-ui/client";
import { isQueueUpdateCustom, type AguiEvent } from "coding-agent/agui/event";
import type { PendingQueues } from "./types";

export type { PendingQueues };

/**
 * Shared pending-queue helpers for the steering-mid-turn flow (chatbot
 * side). Mirrors the worker's `pending-queues.ts` over the same JSON shape:
 * the queue-update event is the source of truth for chip visibility, and
 * `pendingChipText` is the single derivation shared by the live event and
 * the snapshot rehydration so both can never disagree.
 */

/** Defensive string-list read: non-strings dropped, non-arrays read as empty. */
export function stringArrayOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

/** Coerce an unknown queue-shaped payload into owned `PendingQueues`. */
export function pendingQueuesOf(value: unknown): PendingQueues {
  if (!value || typeof value !== "object") return { steering: [], followUp: [] };
  const raw = value as { steering?: unknown; followUp?: unknown };
  return {
    steering: stringArrayOf(raw.steering),
    followUp: stringArrayOf(raw.followUp),
  };
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
  const first = (value: unknown): string | null => {
    const list = stringArrayOf(value);
    return list.find((entry) => entry.trim().length > 0) ?? null;
  };
  return first(pending.followUp) ?? first(pending.steering);
}

/**
 * Chip text from a queue-update CUSTOM event. Non-queue events (and
 * malformed values) return undefined so the caller leaves the chip
 * untouched; anything else resolves through `pendingChipText` (null clears
 * the chip when the worker reports empty queues, e.g. after delivery).
 */
export function pendingMessageFromEvent(event: BaseEvent): string | null | undefined {
  const aguiEvent = event as unknown as AguiEvent;
  if (!isQueueUpdateCustom(aguiEvent)) return undefined;
  const value = aguiEvent.value;
  if (!value || typeof value !== "object") return undefined;
  return pendingChipText(value as { steering?: unknown; followUp?: unknown });
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
