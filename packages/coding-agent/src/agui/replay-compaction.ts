import type { LoggedAguiEvent } from "./event-log";
import { deltaKey, type AguiEvent } from "./agui-event";

/**
 * Streaming deltas dominate the event log: a single reasoning message or
 * tool call can account for thousands of CHUNK/ARGS entries. Replaying them
 * verbatim on reconnect forces the client to re-process every delta (a full
 * message-state clone plus a re-render per event in @ag-ui/client), which
 * blocks the browser main thread for seconds on long sessions.
 *
 * Consecutive deltas of the same message/tool call are concatenation
 * equivalent — the client applies them with `content += delta` — so each
 * run can be merged into a single event carrying the full delta. The merged
 * event keeps the LAST merged seq so the client's cursor still advances
 * past every merged entry. Only the replayed tail is compacted; the live
 * stream keeps flowing delta by delta.
 */
export function compactReplayEvents(replay: LoggedAguiEvent[]): LoggedAguiEvent[] {
  const out: LoggedAguiEvent[] = [];
  for (const entry of replay) {
    const prev = out[out.length - 1];
    const prevDelta = (prev?.event as { delta?: unknown })?.delta;
    const nextDelta = (entry.event as { delta?: unknown }).delta;
    if (
      prev &&
      typeof prevDelta === "string" &&
      typeof nextDelta === "string" &&
      deltaKey(prev.event) !== null &&
      deltaKey(prev.event) === deltaKey(entry.event)
    ) {
      const mergedDelta = prevDelta + nextDelta;
      out[out.length - 1] = {
        epoch: entry.epoch,
        seq: entry.seq,
        event: { ...prev.event, delta: mergedDelta } as AguiEvent,
      };
    } else {
      out.push(entry);
    }
  }
  return out;
}
