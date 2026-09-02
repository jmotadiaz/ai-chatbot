/**
 * Central AG-UI vocabulary. Single source of truth for event shapes and the
 * four dispersed knowledges now owned here:
 *
 * - isTerminal
 * - deltaKey
 * - trackOpen + OpenEventsState
 * - isSyncPoint
 *
 * The translator *produces* the closed KnownAguiEvent union (never Unknown);
 * the other modules *consume* AguiEvent (Known | Unknown) through the pure
 * helpers. Unknown is the escape hatch for the external AG-UI protocol.
 */

export const AguiEventType = {
  RUN_STARTED: "RUN_STARTED",
  RUN_FINISHED: "RUN_FINISHED",
  RUN_ERROR: "RUN_ERROR",
  MESSAGES_SNAPSHOT: "MESSAGES_SNAPSHOT",
  TEXT_MESSAGE_CHUNK: "TEXT_MESSAGE_CHUNK",
  REASONING_MESSAGE_CHUNK: "REASONING_MESSAGE_CHUNK",
  TOOL_CALL_START: "TOOL_CALL_START",
  TOOL_CALL_ARGS: "TOOL_CALL_ARGS",
  TOOL_CALL_END: "TOOL_CALL_END",
  TOOL_CALL_RESULT: "TOOL_CALL_RESULT",
  STEP_STARTED: "STEP_STARTED",
  STEP_FINISHED: "STEP_FINISHED",
  CUSTOM: "CUSTOM",
} as const;

export type AguiEventTypeValue = typeof AguiEventType[keyof typeof AguiEventType];

export const FILES_CHANGED_EVENT = "coding_agent_files_changed" as const;
export const CODING_AGENT_CURSOR_EVENT = "coding_agent_cursor" as const;

export interface AguiEventBase {
  timestamp: number;
}

export interface RunStartedEvent extends AguiEventBase {
  type: typeof AguiEventType.RUN_STARTED;
  threadId: string;
  runId: string;
}

export interface RunFinishedEvent extends AguiEventBase {
  type: typeof AguiEventType.RUN_FINISHED;
  threadId: string;
  runId: string;
}

export interface RunErrorEvent extends AguiEventBase {
  type: typeof AguiEventType.RUN_ERROR;
  threadId: string;
  runId: string;
  message: string;
}

export interface MessagesSnapshotEvent extends AguiEventBase {
  type: typeof AguiEventType.MESSAGES_SNAPSHOT;
  messages: unknown[];
}

export interface TextMessageChunkEvent extends AguiEventBase {
  type: typeof AguiEventType.TEXT_MESSAGE_CHUNK;
  messageId: string;
  role: "assistant";
  delta: string;
}

export interface ReasoningMessageChunkEvent extends AguiEventBase {
  type: typeof AguiEventType.REASONING_MESSAGE_CHUNK;
  messageId: string;
  delta: string;
}

export interface ToolCallStartEvent extends AguiEventBase {
  type: typeof AguiEventType.TOOL_CALL_START;
  toolCallId: string;
  toolCallName: string;
  parentMessageId?: string;
}

export interface ToolCallArgsEvent extends AguiEventBase {
  type: typeof AguiEventType.TOOL_CALL_ARGS;
  toolCallId: string;
  delta: string;
}

export interface ToolCallEndEvent extends AguiEventBase {
  type: typeof AguiEventType.TOOL_CALL_END;
  toolCallId: string;
}

export interface ToolCallResultEvent extends AguiEventBase {
  type: typeof AguiEventType.TOOL_CALL_RESULT;
  messageId: string;
  toolCallId: string;
  role: "tool";
  content: string;
}

export interface StepStartedEvent extends AguiEventBase {
  type: typeof AguiEventType.STEP_STARTED;
  stepName: string;
  rawEvent: unknown;
}

export interface StepFinishedEvent extends AguiEventBase {
  type: typeof AguiEventType.STEP_FINISHED;
  stepName: string;
  rawEvent: unknown;
}

export interface FilesChangedCustomEvent extends AguiEventBase {
  type: typeof AguiEventType.CUSTOM;
  name: typeof FILES_CHANGED_EVENT;
  value: { runId: string; files: Array<{ path: string; status: string }> };
}

export interface CursorCustomEvent extends AguiEventBase {
  type: typeof AguiEventType.CUSTOM;
  name: typeof CODING_AGENT_CURSOR_EVENT;
  value: { seq: number; epoch?: string; terminal?: boolean };
}

export type UnknownAguiEvent = AguiEventBase & {
  type: string;
  name?: string;
  value?: unknown;
  [key: string]: unknown;
};

export type KnownAguiEvent =
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | MessagesSnapshotEvent
  | TextMessageChunkEvent
  | ReasoningMessageChunkEvent
  | ToolCallStartEvent
  | ToolCallArgsEvent
  | ToolCallEndEvent
  | ToolCallResultEvent
  | StepStartedEvent
  | StepFinishedEvent
  | FilesChangedCustomEvent
  | CursorCustomEvent;

export type AguiEvent = KnownAguiEvent | UnknownAguiEvent;

// ---------------------------------------------------------------------------
// Type-level check that AguiEventType keys coincide with the union's `type`.
// For CUSTOM, the union has two variants sharing the same discriminant value,
// so we check set inclusion rather than one-to-one.
// ---------------------------------------------------------------------------
type _AguiEventTypeCheck = AguiEventTypeValue extends KnownAguiEvent["type"]
  ? KnownAguiEvent["type"] extends AguiEventTypeValue
    ? true
    : never
  : never;
const _aguiEventTypeCheck: _AguiEventTypeCheck = true;
void _aguiEventTypeCheck;

// ---------------------------------------------------------------------------
// Guards for the two typed CUSTOM variants
// ---------------------------------------------------------------------------
export function isFilesChangedCustom(event: AguiEvent): event is FilesChangedCustomEvent {
  return (
    event.type === AguiEventType.CUSTOM &&
    (event as { name?: unknown }).name === FILES_CHANGED_EVENT
  );
}

export function isCursorCustom(event: AguiEvent): event is CursorCustomEvent {
  return (
    event.type === AguiEventType.CUSTOM &&
    (event as { name?: unknown }).name === CODING_AGENT_CURSOR_EVENT
  );
}

// ---------------------------------------------------------------------------
// Pure helpers — the four dispersed knowledges
// ---------------------------------------------------------------------------

export function isTerminal(event: AguiEvent): boolean {
  return (
    event.type === AguiEventType.RUN_FINISHED ||
    event.type === AguiEventType.RUN_ERROR
  );
}

/**
 * Identifies a run of mergeable deltas: same event type plus same target
 * (message or tool call), with a string delta to concatenate. Anything else
 * (structural events, malformed deltas) breaks the run.
 *
 * Mirrors the former `deltaRunKey` in replay-compaction, now without casts.
 */
export function deltaKey(event: AguiEvent): string | null {
  const delta = (event as { delta?: unknown }).delta;
  if (typeof delta !== "string") return null;
  switch (event.type) {
    case AguiEventType.TEXT_MESSAGE_CHUNK:
    case AguiEventType.REASONING_MESSAGE_CHUNK: {
      const messageId = (event as { messageId?: unknown }).messageId;
      return typeof messageId === "string" ? `${event.type}:${messageId}` : null;
    }
    case AguiEventType.TOOL_CALL_ARGS: {
      const toolCallId = (event as { toolCallId?: unknown }).toolCallId;
      return typeof toolCallId === "string" ? `${event.type}:${toolCallId}` : null;
    }
    default:
      return null;
  }
}

export interface OpenEventsState {
  openToolCalls: Map<string, { toolCallName?: string; parentMessageId?: string }>;
  openSteps: Map<string, AguiEvent>;
}

/**
 * Pure state tracker — absorbs the machine formerly in reconnect-prelude.
 * Mutates `state` according to the event's open/close effect.
 * Unknown and non-structural events are no-ops (policy "no tocar").
 */
export function trackOpen(event: AguiEvent, state: OpenEventsState): void {
  switch (event.type) {
    case AguiEventType.TOOL_CALL_START: {
      const e = event as ToolCallStartEvent;
      if (e.toolCallId) {
        state.openToolCalls.set(e.toolCallId, {
          toolCallName: e.toolCallName,
          parentMessageId: e.parentMessageId,
        });
      }
      break;
    }
    case AguiEventType.TOOL_CALL_END: {
      const e = event as ToolCallEndEvent;
      if (e.toolCallId) state.openToolCalls.delete(e.toolCallId);
      break;
    }
    case AguiEventType.STEP_STARTED: {
      const e = event as StepStartedEvent;
      if (e.stepName) state.openSteps.set(e.stepName, event);
      break;
    }
    case AguiEventType.STEP_FINISHED: {
      const e = event as StepFinishedEvent;
      if (e.stepName) state.openSteps.delete(e.stepName);
      break;
    }
    case AguiEventType.RUN_FINISHED:
    case AguiEventType.RUN_ERROR:
      state.openToolCalls.clear();
      state.openSteps.clear();
      break;
    default:
      break;
  }
}

/**
 * Sync-point helper — absorbs the `message_end` / `tool_execution_end`
 * → `snapshotCursorSeq` knowledge formerly checked directly against Pi
 * event types in turn-runner and subagent-collector.
 *
 * Takes a generic `{ type: string }` so it can be called with either a Pi
 * CodingAgentEvent or an AguiEvent; AguiEvents never match Pi sync types
 * and correctly return false (policy "no tocar" for Agui).
 */
export function isSyncPoint(event: { type: string }): boolean {
  return event.type === "message_end" || event.type === "tool_execution_end";
}

// Exhaustiveness helper for consumers.
export function assertNever(x: never): never {
  throw new Error(`Unexpected AguiEvent: ${JSON.stringify(x)}`);
}
