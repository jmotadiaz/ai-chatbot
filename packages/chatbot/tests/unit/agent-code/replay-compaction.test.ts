import { EventType } from "@ag-ui/client";
import { beforeEach, describe, it, expect } from "vitest";
import { compactReplayEvents } from "coding-agent/replay-compaction";
import type { LoggedAguiEvent } from "coding-agent/event-log";

let seq = 0;
function logged(event: Record<string, unknown>): LoggedAguiEvent {
  seq += 1;
  return { epoch: "e1", seq, event: event as never };
}

beforeEach(() => {
  seq = 0;
});

describe("compactReplayEvents", () => {
  it("returns an empty array for empty input", () => {
    expect(compactReplayEvents([])).toEqual([]);
  });

  it("concatenates consecutive chunks of the same message into a single event", () => {
    const result = compactReplayEvents([
      logged({ type: EventType.TEXT_MESSAGE_CHUNK, messageId: "m1", role: "assistant", delta: "The " }),
      logged({ type: EventType.TEXT_MESSAGE_CHUNK, messageId: "m1", role: "assistant", delta: "user " }),
      logged({ type: EventType.TEXT_MESSAGE_CHUNK, messageId: "m1", role: "assistant", delta: "wants" }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].event).toMatchObject({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: "m1",
      role: "assistant",
      delta: "The user wants",
    });
  });

  it("stamps the compacted event with the seq of the last merged entry", () => {
    const result = compactReplayEvents([
      logged({ type: EventType.REASONING_MESSAGE_CHUNK, messageId: "r1", delta: "a" }),
      logged({ type: EventType.REASONING_MESSAGE_CHUNK, messageId: "r1", delta: "b" }),
      logged({ type: EventType.REASONING_MESSAGE_CHUNK, messageId: "r1", delta: "c" }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].seq).toBe(3);
    expect(result[0].epoch).toBe("e1");
  });

  it("does not merge chunks of different messages", () => {
    const result = compactReplayEvents([
      logged({ type: EventType.REASONING_MESSAGE_CHUNK, messageId: "r1", delta: "a" }),
      logged({ type: EventType.REASONING_MESSAGE_CHUNK, messageId: "r2", delta: "b" }),
      logged({ type: EventType.REASONING_MESSAGE_CHUNK, messageId: "r1", delta: "c" }),
    ]);

    expect(result.map((e) => [e.event.messageId, e.event.delta])).toEqual([
      ["r1", "a"],
      ["r2", "b"],
      ["r1", "c"],
    ]);
  });

  it("does not merge different delta event types for the same message", () => {
    const result = compactReplayEvents([
      logged({ type: EventType.TEXT_MESSAGE_CHUNK, messageId: "m1", delta: "a" }),
      logged({ type: EventType.REASONING_MESSAGE_CHUNK, messageId: "m1", delta: "b" }),
    ]);

    expect(result).toHaveLength(2);
  });

  it("concatenates consecutive TOOL_CALL_ARGS of the same tool call", () => {
    const result = compactReplayEvents([
      logged({ type: EventType.TOOL_CALL_ARGS, toolCallId: "t1", delta: '{"path":' }),
      logged({ type: EventType.TOOL_CALL_ARGS, toolCallId: "t1", delta: '"/a.ts"}' }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].event).toMatchObject({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: "t1",
      delta: '{"path":"/a.ts"}',
    });
    expect(result[0].seq).toBe(2);
  });

  it("does not merge TOOL_CALL_ARGS of different tool calls", () => {
    const result = compactReplayEvents([
      logged({ type: EventType.TOOL_CALL_ARGS, toolCallId: "t1", delta: "a" }),
      logged({ type: EventType.TOOL_CALL_ARGS, toolCallId: "t2", delta: "b" }),
    ]);

    expect(result).toHaveLength(2);
  });

  it("a structural event breaks a run of deltas", () => {
    const result = compactReplayEvents([
      logged({ type: EventType.TEXT_MESSAGE_CHUNK, messageId: "m1", delta: "a" }),
      logged({ type: EventType.TOOL_CALL_START, toolCallId: "t1", toolCallName: "bash" }),
      logged({ type: EventType.TEXT_MESSAGE_CHUNK, messageId: "m1", delta: "b" }),
    ]);

    expect(result.map((e) => e.event.type)).toEqual([
      EventType.TEXT_MESSAGE_CHUNK,
      EventType.TOOL_CALL_START,
      EventType.TEXT_MESSAGE_CHUNK,
    ]);
    expect(result[0].event.delta).toBe("a");
    expect(result[2].event.delta).toBe("b");
  });

  it("passes non-delta events through untouched", () => {
    const terminal = logged({ type: EventType.RUN_FINISHED, threadId: "s", runId: "r" });
    const result = compactReplayEvents([terminal]);

    expect(result).toHaveLength(1);
    expect(result[0].event).toBe(terminal.event);
  });

  it("does not merge a chunk whose delta is not a string", () => {
    const result = compactReplayEvents([
      logged({ type: EventType.TEXT_MESSAGE_CHUNK, messageId: "m1", delta: "a" }),
      logged({ type: EventType.TEXT_MESSAGE_CHUNK, messageId: "m1" }),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].event.delta).toBe("a");
  });
});
