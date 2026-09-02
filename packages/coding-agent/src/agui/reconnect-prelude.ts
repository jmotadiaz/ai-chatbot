import type { LoggedAguiEvent } from "./event-log";
import {
  AguiEventType as EventType,
  type AguiEvent,
  type OpenEventsState,
  trackOpen,
} from "./agui-event";

/**
 * AG-UI verifies protocol invariants per run: a reconnect run starts with no
 * active tool calls or steps, so replaying events from a cursor that falls
 * inside an open tool call (or before its step finished) is rejected by the
 * client. This computes the synthetic TOOL_CALL_START / STEP_STARTED events
 * that must precede the replay so the verifier accepts the tail.
 *
 * `events` must be the log prefix up to and including the client's cursor.
 */
export function buildReconnectPrelude(events: LoggedAguiEvent[]): AguiEvent[] {
  const state: OpenEventsState = {
    openToolCalls: new Map<string, { toolCallName?: string; parentMessageId?: string }>(),
    openSteps: new Map<string, AguiEvent>(),
  };

  for (const { event } of events) {
    trackOpen(event, state);
  }

  const prelude: AguiEvent[] = [];
  for (const [toolCallId, info] of state.openToolCalls) {
    prelude.push({
      type: EventType.TOOL_CALL_START,
      toolCallId,
      toolCallName: info.toolCallName ?? "unknown",
      parentMessageId: info.parentMessageId,
      timestamp: Date.now(),
    });
  }
  for (const [, started] of state.openSteps) {
    const e = started as { stepName?: string; rawEvent?: unknown };
    prelude.push({
      type: EventType.STEP_STARTED,
      stepName: e.stepName!,
      ...(e.rawEvent !== undefined ? { rawEvent: e.rawEvent } : { rawEvent: undefined }),
      timestamp: Date.now(),
    });
  }
  return prelude;
}
