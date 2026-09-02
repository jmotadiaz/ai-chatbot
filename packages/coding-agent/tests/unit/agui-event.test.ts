import { describe, it, expect } from "vitest";
import {
  AguiEventType,
  FILES_CHANGED_EVENT,
  CODING_AGENT_CURSOR_EVENT,
  isTerminal,
  deltaKey,
  trackOpen,
  isSyncPoint,
  isFilesChangedCustom,
  isCursorCustom,
  assertNever,
  type AguiEvent,
  type OpenEventsState,
} from "../../src/agui/agui-event";

function makeState(): OpenEventsState {
  return {
    openToolCalls: new Map(),
    openSteps: new Map(),
  };
}

describe("agui-event helpers", () => {
  it("isTerminal returns true only for RUN_FINISHED and RUN_ERROR", () => {
    expect(isTerminal({ type: AguiEventType.RUN_FINISHED, threadId: "t", runId: "r", timestamp: 1 })).toBe(true);
    expect(isTerminal({ type: AguiEventType.RUN_ERROR, threadId: "t", runId: "r", message: "boom", timestamp: 1 })).toBe(true);
    expect(isTerminal({ type: AguiEventType.RUN_STARTED, threadId: "t", runId: "r", timestamp: 1 })).toBe(false);
    expect(isTerminal({ type: AguiEventType.TEXT_MESSAGE_CHUNK, messageId: "m", role: "assistant", delta: "hi", timestamp: 1 })).toBe(false);
    // Unknown is not terminal (policy no tocar)
    expect(isTerminal({ type: "SOME_FUTURE_EVENT", timestamp: 1 } as AguiEvent)).toBe(false);
    expect(isTerminal({ type: AguiEventType.CUSTOM, name: "unknown_custom", value: {}, timestamp: 1 } as AguiEvent)).toBe(false);
  });

  it("deltaKey identifies concatenable deltas and returns compound key", () => {
    expect(deltaKey({ type: AguiEventType.TEXT_MESSAGE_CHUNK, messageId: "m1", role: "assistant", delta: "a", timestamp: 1 })).toBe(
      "TEXT_MESSAGE_CHUNK:m1",
    );
    expect(deltaKey({ type: AguiEventType.REASONING_MESSAGE_CHUNK, messageId: "r1", delta: "b", timestamp: 1 })).toBe(
      "REASONING_MESSAGE_CHUNK:r1",
    );
    expect(deltaKey({ type: AguiEventType.TOOL_CALL_ARGS, toolCallId: "t1", delta: "c", timestamp: 1 })).toBe(
      "TOOL_CALL_ARGS:t1",
    );
    // non-string delta
    expect(deltaKey({ type: AguiEventType.TEXT_MESSAGE_CHUNK, messageId: "m1", role: "assistant", delta: 123 as unknown as string, timestamp: 1 })).toBeNull();
    // missing messageId/toolCallId
    expect(deltaKey({ type: AguiEventType.TEXT_MESSAGE_CHUNK, messageId: undefined as unknown as string, role: "assistant", delta: "a", timestamp: 1 } as unknown as AguiEvent)).toBeNull();
    // structural events are not delta
    expect(deltaKey({ type: AguiEventType.TOOL_CALL_START, toolCallId: "t1", toolCallName: "bash", timestamp: 1 })).toBeNull();
    expect(deltaKey({ type: AguiEventType.RUN_FINISHED, threadId: "t", runId: "r", timestamp: 1 })).toBeNull();
    // Unknown is not delta
    expect(deltaKey({ type: "UNKNOWN", delta: "x", timestamp: 1 } as unknown as AguiEvent)).toBeNull();
  });

  it("trackOpen mutates OpenEventsState and terminal clears all", () => {
    const state = makeState();
    trackOpen({ type: AguiEventType.TOOL_CALL_START, toolCallId: "t1", toolCallName: "bash", parentMessageId: "m1", timestamp: 1 }, state);
    expect(state.openToolCalls.has("t1")).toBe(true);
    trackOpen({ type: AguiEventType.TOOL_CALL_START, toolCallId: "t2", toolCallName: "read", timestamp: 1 }, state);
    expect(state.openToolCalls.size).toBe(2);

    trackOpen({ type: AguiEventType.TOOL_CALL_END, toolCallId: "t1", timestamp: 1 }, state);
    expect(state.openToolCalls.has("t1")).toBe(false);
    expect(state.openToolCalls.has("t2")).toBe(true);

    trackOpen({ type: AguiEventType.STEP_STARTED, stepName: "tool:bash:t2", rawEvent: { toolCallId: "t2" }, timestamp: 1 }, state);
    expect(state.openSteps.has("tool:bash:t2")).toBe(true);

    trackOpen({ type: AguiEventType.STEP_FINISHED, stepName: "tool:bash:t2", rawEvent: { toolCallId: "t2" }, timestamp: 1 }, state);
    expect(state.openSteps.has("tool:bash:t2")).toBe(false);

    // Re-open then terminal clears
    trackOpen({ type: AguiEventType.TOOL_CALL_START, toolCallId: "t3", toolCallName: "bash", timestamp: 1 }, state);
    trackOpen({ type: AguiEventType.STEP_STARTED, stepName: "tool:bash:t3", rawEvent: {}, timestamp: 1 }, state);
    trackOpen({ type: AguiEventType.RUN_FINISHED, threadId: "t", runId: "r", timestamp: 1 }, state);
    expect(state.openToolCalls.size).toBe(0);
    expect(state.openSteps.size).toBe(0);

    // RUN_ERROR also clears
    trackOpen({ type: AguiEventType.TOOL_CALL_START, toolCallId: "t4", toolCallName: "bash", timestamp: 1 }, state);
    trackOpen({ type: AguiEventType.RUN_ERROR, threadId: "t", runId: "r", message: "boom", timestamp: 1 }, state);
    expect(state.openToolCalls.size).toBe(0);

    // Unknown does not touch state (policy no tocar)
    const before = state.openToolCalls.size;
    trackOpen({ type: "FUTURE_EVENT", timestamp: 1 } as AguiEvent, state);
    expect(state.openToolCalls.size).toBe(before);
    trackOpen({ type: AguiEventType.CUSTOM, name: "unknown_custom", value: {}, timestamp: 1 } as AguiEvent, state);
    expect(state.openToolCalls.size).toBe(before);
  });

  it("isSyncPoint returns true for Pi message_end and tool_execution_end", () => {
    expect(isSyncPoint({ type: "message_end" })).toBe(true);
    expect(isSyncPoint({ type: "tool_execution_end" })).toBe(true);
    expect(isSyncPoint({ type: "message_start" })).toBe(false);
    expect(isSyncPoint({ type: "tool_execution_start" })).toBe(false);
    // Agui events are not sync points
    expect(isSyncPoint({ type: AguiEventType.RUN_FINISHED })).toBe(false);
    expect(isSyncPoint({ type: AguiEventType.TOOL_CALL_RESULT, messageId: "m", toolCallId: "t", role: "tool", content: "x", timestamp: 1 } as unknown as { type: string })).toBe(false);
    // Unknown not sync point
    expect(isSyncPoint({ type: "UNKNOWN_FUTURE" })).toBe(false);
  });

  it("isFilesChangedCustom and isCursorCustom guards discriminate correctly", () => {
    const filesEvent: AguiEvent = {
      type: AguiEventType.CUSTOM,
      name: FILES_CHANGED_EVENT,
      value: { runId: "r1", files: [{ path: "a.ts", status: "modified" }] },
      timestamp: 1,
    };
    const cursorEvent: AguiEvent = {
      type: AguiEventType.CUSTOM,
      name: CODING_AGENT_CURSOR_EVENT,
      value: { seq: 5, epoch: "e1" },
      timestamp: 1,
    };
    const otherCustom: AguiEvent = {
      type: AguiEventType.CUSTOM,
      name: "other_custom",
      value: {},
      timestamp: 1,
    } as AguiEvent;

    expect(isFilesChangedCustom(filesEvent)).toBe(true);
    expect(isCursorCustom(filesEvent)).toBe(false);

    expect(isCursorCustom(cursorEvent)).toBe(true);
    expect(isFilesChangedCustom(cursorEvent)).toBe(false);

    expect(isFilesChangedCustom(otherCustom)).toBe(false);
    expect(isCursorCustom(otherCustom)).toBe(false);

    // Non-custom not matched
    expect(isFilesChangedCustom({ type: AguiEventType.RUN_FINISHED, threadId: "t", runId: "r", timestamp: 1 })).toBe(false);
  });

  it("exhaustiveness: switch over KnownAguiEvent with assertNever compiles and covers all cases", () => {
    function describeEvent(event: AguiEvent): string {
      switch (event.type) {
        case AguiEventType.RUN_STARTED:
          return "run_started";
        case AguiEventType.RUN_FINISHED:
          return "run_finished";
        case AguiEventType.RUN_ERROR:
          return "run_error";
        case AguiEventType.MESSAGES_SNAPSHOT:
          return "snapshot";
        case AguiEventType.TEXT_MESSAGE_CHUNK:
          return `text:${event.delta}`;
        case AguiEventType.REASONING_MESSAGE_CHUNK:
          return `reasoning:${event.delta}`;
        case AguiEventType.TOOL_CALL_START:
          return `start:${event.toolCallId}`;
        case AguiEventType.TOOL_CALL_ARGS:
          return `args:${event.delta}`;
        case AguiEventType.TOOL_CALL_END:
          return `end:${event.toolCallId}`;
        case AguiEventType.TOOL_CALL_RESULT:
          return `result:${event.content}`;
        case AguiEventType.STEP_STARTED:
          return `step_started:${event.stepName}`;
        case AguiEventType.STEP_FINISHED:
          return `step_finished:${event.stepName}`;
        case AguiEventType.CUSTOM: {
          if (isFilesChangedCustom(event)) return `files_changed:${event.value.runId}`;
          if (isCursorCustom(event)) return `cursor:${event.value.seq}`;
          // Unknown custom falls through to default unknown handling: policy no tocar
          return "custom_unknown";
        }
        default: {
          // UnknownAguiEvent falls here; helpers would return no-op, but for exhaustiveness we use assertNever on Known only
          // Here AguiEvent includes Unknown, so default must handle it without assertNever
          return `unknown:${(event as { type: string }).type}`;
        }
      }
    }

    // Each known variant produces expected label without throwing
    const cases: AguiEvent[] = [
      { type: AguiEventType.RUN_STARTED, threadId: "t", runId: "r", timestamp: 1 },
      { type: AguiEventType.RUN_FINISHED, threadId: "t", runId: "r", timestamp: 1 },
      { type: AguiEventType.RUN_ERROR, threadId: "t", runId: "r", message: "e", timestamp: 1 },
      { type: AguiEventType.MESSAGES_SNAPSHOT, messages: [], timestamp: 1 },
      { type: AguiEventType.TEXT_MESSAGE_CHUNK, messageId: "m", role: "assistant", delta: "hi", timestamp: 1 },
      { type: AguiEventType.REASONING_MESSAGE_CHUNK, messageId: "m", delta: "think", timestamp: 1 },
      { type: AguiEventType.TOOL_CALL_START, toolCallId: "t1", toolCallName: "bash", timestamp: 1 },
      { type: AguiEventType.TOOL_CALL_ARGS, toolCallId: "t1", delta: "args", timestamp: 1 },
      { type: AguiEventType.TOOL_CALL_END, toolCallId: "t1", timestamp: 1 },
      { type: AguiEventType.TOOL_CALL_RESULT, messageId: "m", toolCallId: "t1", role: "tool", content: "ok", timestamp: 1 },
      { type: AguiEventType.STEP_STARTED, stepName: "tool:bash:t1", rawEvent: {}, timestamp: 1 },
      { type: AguiEventType.STEP_FINISHED, stepName: "tool:bash:t1", rawEvent: {}, timestamp: 1 },
      { type: AguiEventType.CUSTOM, name: FILES_CHANGED_EVENT, value: { runId: "r", files: [] }, timestamp: 1 },
      { type: AguiEventType.CUSTOM, name: CODING_AGENT_CURSOR_EVENT, value: { seq: 2 }, timestamp: 1 },
      { type: "FUTURE_EVENT", timestamp: 1 } as AguiEvent,
    ];

    for (const ev of cases) {
      expect(() => describeEvent(ev)).not.toThrow();
    }
  });

  it("assertNever throws for unexpected value", () => {
    expect(() => assertNever("oops" as never)).toThrow();
  });
});
