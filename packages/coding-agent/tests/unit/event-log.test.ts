import { describe, it, expect } from "vitest";
import { SessionEventLog, type Cursor } from "../../src/event-log";
import { AguiEventType as EventType, type BaseEvent } from "../../src/pi-to-agui-translator";

function append(log: SessionEventLog, event: Record<string, unknown>): void {
  log.append(event as BaseEvent);
}

describe("SessionEventLog.replayAfter", () => {
  it("compacts the replayed tail: 5 deltas after the cursor become 1 event", () => {
    const log = new SessionEventLog();
    append(log, { type: EventType.TEXT_MESSAGE_CHUNK, messageId: "m1", delta: "hola " });
    append(log, { type: EventType.TEXT_MESSAGE_CHUNK, messageId: "m1", delta: "mundo " });
    append(log, { type: EventType.TEXT_MESSAGE_CHUNK, messageId: "m1", delta: "extra" });
    append(log, { type: EventType.TEXT_MESSAGE_CHUNK, messageId: "m1", delta: "ordi" });
    append(log, { type: EventType.TEXT_MESSAGE_CHUNK, messageId: "m1", delta: "nario" });

    const { prelude, events } = log.replayAfter({ epoch: log.epoch, seq: 2 });

    expect(events).toHaveLength(1);
    expect(events[0]!.event).toMatchObject({
      type: EventType.TEXT_MESSAGE_CHUNK,
      messageId: "m1",
      delta: "extraordinario",
    });
    expect(prelude).toEqual([]);
  });

  it("keeps the seq of the last merged delta so the cursor advances", () => {
    const log = new SessionEventLog();
    append(log, { type: EventType.TOOL_CALL_START, toolCallId: "t1", toolCallName: "bash" });
    append(log, { type: EventType.TOOL_CALL_ARGS, toolCallId: "t1", delta: "ls" });
    append(log, { type: EventType.TOOL_CALL_ARGS, toolCallId: "t1", delta: " -la" });

    const { events } = log.replayAfter({ epoch: log.epoch, seq: 1 });

    expect(events).toHaveLength(1);
    expect(events[0]!.epoch).toBe(log.epoch);
    expect(events[0]!.seq).toBe(3);
    expect(events[0]!.event).toMatchObject({ type: EventType.TOOL_CALL_ARGS, delta: "ls -la" });
  });

  it("stamps every prelude entry with the cursor seq: synthetic events never advance it", () => {
    const log = new SessionEventLog();
    append(log, { type: EventType.TOOL_CALL_START, toolCallId: "t1", toolCallName: "bash" });
    append(log, { type: EventType.TOOL_CALL_ARGS, toolCallId: "t1", delta: "ls" });
    append(log, { type: EventType.STEP_STARTED, stepName: "tool:bash:t1" });

    const cursor: Cursor = { epoch: log.epoch, seq: 3 };
    const { prelude, events } = log.replayAfter(cursor);

    expect(prelude).toHaveLength(2); // open tool call + open step
    expect(prelude.every((e) => e.seq === cursor.seq)).toBe(true);
    expect(prelude.every((e) => e.epoch === log.epoch)).toBe(true);
    expect(events).toEqual([]);
  });

  it("always yields prelude first, at the cursor, and events strictly after it", () => {
    const log = new SessionEventLog();
    append(log, { type: EventType.TOOL_CALL_START, toolCallId: "t1", toolCallName: "bash" });
    append(log, { type: EventType.TEXT_MESSAGE_CHUNK, messageId: "m1", delta: "a" });
    append(log, { type: EventType.TEXT_MESSAGE_CHUNK, messageId: "m1", delta: "b" });

    const cursor: Cursor = { epoch: log.epoch, seq: 1 };
    const { prelude, events } = log.replayAfter(cursor);

    expect(prelude).toHaveLength(1);
    expect(prelude[0]!.event).toMatchObject({
      type: EventType.TOOL_CALL_START,
      toolCallId: "t1",
    });
    expect(prelude[0]!.seq).toBe(cursor.seq);
    expect(events).toHaveLength(1);
    expect(events[0]!.seq).toBe(3); // last merged delta, still > cursor.seq
  });

  it("does not re-open tool calls that closed before the cursor", () => {
    const log = new SessionEventLog();
    append(log, { type: EventType.TOOL_CALL_START, toolCallId: "t1" });
    append(log, { type: EventType.TOOL_CALL_END, toolCallId: "t1" });
    append(log, { type: EventType.TEXT_MESSAGE_CHUNK, messageId: "m1", delta: "done" });

    const { prelude, events } = log.replayAfter({ epoch: log.epoch, seq: 2 });

    expect(prelude).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]!.event).toMatchObject({
      type: EventType.TEXT_MESSAGE_CHUNK,
      delta: "done",
    });
  });

  it("emits nothing when a terminal event sits at or before the cursor", () => {
    const log = new SessionEventLog();
    append(log, { type: EventType.TOOL_CALL_START, toolCallId: "t1" });
    append(log, { type: EventType.RUN_ERROR, message: "boom" });

    const { prelude, events } = log.replayAfter({ epoch: log.epoch, seq: 2 });

    expect(prelude).toEqual([]);
    expect(events).toEqual([]);
  });

  it("throws on a stale epoch so the caller surfaces it as a stream error", () => {
    const log = new SessionEventLog();
    append(log, { type: EventType.TEXT_MESSAGE_CHUNK, messageId: "m1", delta: "a" });

    expect(() => log.replayAfter({ epoch: "another-epoch", seq: 1 })).toThrow(
      "Cursor epoch mismatch",
    );
  });

  it("accepts a cursor at seq 0 and one past the last seq", () => {
    const log = new SessionEventLog();
    append(log, { type: EventType.TEXT_MESSAGE_CHUNK, messageId: "m1", delta: "a" });

    const fresh = log.replayAfter({ epoch: log.epoch, seq: 0 });
    expect(fresh.prelude).toEqual([]);
    expect(fresh.events).toHaveLength(1);

    const caughtUp = log.replayAfter({ epoch: log.epoch, seq: 99 });
    expect(caughtUp.prelude).toEqual([]);
    expect(caughtUp.events).toEqual([]);
  });
});