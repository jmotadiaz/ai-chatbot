import { EventType } from "@ag-ui/client";
import { describe, it, expect } from "vitest";

import { buildReconnectPrelude } from "coding-agent/reconnect-prelude";
import type { LoggedAguiEvent } from "coding-agent/event-log";

type Event = { type: string; [k: string]: unknown };

function logged(events: Event[]): LoggedAguiEvent[] {
  return events.map((event, i) => ({
    epoch: "e1",
    seq: i + 1,
    event: event as LoggedAguiEvent["event"],
  }));
}

const toolStart: Event = {
  type: EventType.TOOL_CALL_START,
  toolCallId: "t1",
  toolCallName: "write",
  parentMessageId: "m1",
};
const toolArgs: Event = { type: EventType.TOOL_CALL_ARGS, toolCallId: "t1", delta: "{" };
const toolEnd: Event = { type: EventType.TOOL_CALL_END, toolCallId: "t1" };
const stepStart: Event = {
  type: EventType.STEP_STARTED,
  stepName: "tool:write:t1",
  rawEvent: { toolCallId: "t1" },
};
const stepEnd: Event = { type: EventType.STEP_FINISHED, stepName: "tool:write:t1" };

describe("buildReconnectPrelude", () => {
  it("re-opens a tool call cut mid-args", () => {
    const prelude = buildReconnectPrelude(logged([toolStart, toolArgs]));
    expect(prelude).toHaveLength(1);
    expect(prelude[0]).toMatchObject({
      type: EventType.TOOL_CALL_START,
      toolCallId: "t1",
      toolCallName: "write",
      parentMessageId: "m1",
    });
  });

  it("re-opens a step cut mid-execution, preserving rawEvent", () => {
    const prelude = buildReconnectPrelude(
      logged([toolStart, toolArgs, toolEnd, stepStart]),
    );
    expect(prelude).toHaveLength(1);
    expect(prelude[0]).toMatchObject({
      type: EventType.STEP_STARTED,
      stepName: "tool:write:t1",
      rawEvent: { toolCallId: "t1" },
    });
  });

  it("emits nothing when every tool call and step is closed", () => {
    const prelude = buildReconnectPrelude(
      logged([toolStart, toolArgs, toolEnd, stepStart, stepEnd]),
    );
    expect(prelude).toEqual([]);
  });

  it("emits nothing when the cursor sits after a terminal event", () => {
    const prelude = buildReconnectPrelude(
      logged([toolStart, toolArgs, { type: EventType.RUN_ERROR, message: "boom" }]),
    );
    expect(prelude).toEqual([]);
  });

  it("only re-opens tool calls still open at the cursor", () => {
    const otherStart: Event = {
      type: EventType.TOOL_CALL_START,
      toolCallId: "t2",
      toolCallName: "read",
    };
    const prelude = buildReconnectPrelude(
      logged([toolStart, toolArgs, toolEnd, otherStart]),
    );
    expect(prelude).toHaveLength(1);
    expect(prelude[0]).toMatchObject({
      type: EventType.TOOL_CALL_START,
      toolCallId: "t2",
    });
  });
});
