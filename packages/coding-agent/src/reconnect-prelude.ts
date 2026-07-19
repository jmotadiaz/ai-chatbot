import type { LoggedAguiEvent } from "./event-log";
import { AguiEventType as EventType, type BaseEvent } from "./pi-to-agui-translator";

/**
 * AG-UI verifies protocol invariants per run: a reconnect run starts with no
 * active tool calls or steps, so replaying events from a cursor that falls
 * inside an open tool call (or before its step finished) is rejected by the
 * client. This computes the synthetic TOOL_CALL_START / STEP_STARTED events
 * that must precede the replay so the verifier accepts the tail.
 *
 * `events` must be the log prefix up to and including the client's cursor.
 */
export function buildReconnectPrelude(events: LoggedAguiEvent[]): BaseEvent[] {
  const openToolCalls = new Map<
    string,
    { toolCallName?: string; parentMessageId?: string }
  >();
  const openSteps = new Map<string, BaseEvent>();

  for (const { event } of events) {
    switch (event.type) {
      case EventType.TOOL_CALL_START: {
        const e = event as {
          toolCallId?: string;
          toolCallName?: string;
          parentMessageId?: string;
        };
        if (e.toolCallId) {
          openToolCalls.set(e.toolCallId, {
            toolCallName: e.toolCallName,
            parentMessageId: e.parentMessageId,
          });
        }
        break;
      }
      case EventType.TOOL_CALL_END: {
        const e = event as { toolCallId?: string };
        if (e.toolCallId) openToolCalls.delete(e.toolCallId);
        break;
      }
      case EventType.STEP_STARTED: {
        const e = event as { stepName?: string };
        if (e.stepName) openSteps.set(e.stepName, event);
        break;
      }
      case EventType.STEP_FINISHED: {
        const e = event as { stepName?: string };
        if (e.stepName) openSteps.delete(e.stepName);
        break;
      }
      // A terminal event closes the run and everything in it; the next run
      // re-opens its own tool calls and steps inside the replayed tail.
      case EventType.RUN_FINISHED:
      case EventType.RUN_ERROR:
        openToolCalls.clear();
        openSteps.clear();
        break;
      default:
        break;
    }
  }

  const prelude: BaseEvent[] = [];
  for (const [toolCallId, info] of openToolCalls) {
    prelude.push({
      type: EventType.TOOL_CALL_START,
      toolCallId,
      toolCallName: info.toolCallName,
      parentMessageId: info.parentMessageId,
      timestamp: Date.now(),
    } as BaseEvent);
  }
  for (const [, started] of openSteps) {
    const e = started as { stepName?: string; rawEvent?: unknown };
    prelude.push({
      type: EventType.STEP_STARTED,
      stepName: e.stepName,
      ...(e.rawEvent !== undefined ? { rawEvent: e.rawEvent } : {}),
      timestamp: Date.now(),
    } as BaseEvent);
  }
  return prelude;
}
