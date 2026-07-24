import type { LoggedAguiEvent } from "./event-log";
import { AguiEventType as EventType, type BaseEvent } from "./pi-to-agui-translator";

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
    const prevDelta = prev ? (prev.event as { delta?: unknown }).delta : undefined;
    const nextDelta = (entry.event as { delta?: unknown }).delta;
    if (
      prev &&
      typeof prevDelta === "string" &&
      typeof nextDelta === "string" &&
      deltaRunKey(prev.event) !== null &&
      deltaRunKey(prev.event) === deltaRunKey(entry.event)
    ) {
      out[out.length - 1] = {
        epoch: entry.epoch,
        seq: entry.seq,
        event: { ...prev.event, delta: prevDelta + nextDelta },
      };
    } else {
      out.push(entry);
    }
  }
  return out;
}

/**
 * Identifies a run of mergeable deltas: same event type plus same target
 * (message or tool call), with a string delta to concatenate. Anything else
 * (structural events, malformed deltas) breaks the run and passes through.
 */
function deltaRunKey(event: BaseEvent): string | null {
  if (typeof (event as { delta?: unknown }).delta !== "string") return null;
  switch (event.type) {
    case EventType.TEXT_MESSAGE_CHUNK:
    case EventType.REASONING_MESSAGE_CHUNK: {
      const messageId = (event as { messageId?: unknown }).messageId;
      return typeof messageId === "string" ? `${event.type}:${messageId}` : null;
    }
    case EventType.TOOL_CALL_ARGS: {
      const toolCallId = (event as { toolCallId?: unknown }).toolCallId;
      return typeof toolCallId === "string" ? `${event.type}:${toolCallId}` : null;
    }
    default:
      return null;
  }
}
