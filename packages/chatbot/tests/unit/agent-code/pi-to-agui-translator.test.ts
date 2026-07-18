/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { EventType } from "@ag-ui/client";
import { PiToAguiTranslator } from "@/lib/features/code/pi-to-agui-translator";

const ctx = { threadId: "thread-1", runId: "run-1" };

function types(events: Array<{ type: string }>) {
  return events.map((e) => e.type);
}

describe("pi-to-agui-translator (chunk-based)", () => {
  it("translates agent_start to RUN_STARTED", () => {
    const t = new PiToAguiTranslator(ctx);
    expect(types(t.translate({ type: "agent_start" }))).toEqual([
      EventType.RUN_STARTED,
    ]);
  });

  it("translates agent_end to RUN_FINISHED", () => {
    const t = new PiToAguiTranslator(ctx);
    expect(types(t.translate({ type: "agent_end" }))).toEqual([
      EventType.RUN_FINISHED,
    ]);
  });

  it("emits TEXT_MESSAGE_CHUNK for each text_delta with a stable messageId", () => {
    const t = new PiToAguiTranslator(ctx);

    t.translate({ type: "message_start", message: { role: "assistant" } });
    t.translate({
      type: "message_update",
      assistantMessageEvent: { type: "text_start", contentIndex: 0 },
    });
    const delta1 = t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "text_delta",
        contentIndex: 0,
        delta: "Hi",
      },
    });
    const delta2 = t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "text_delta",
        contentIndex: 0,
        delta: " there",
      },
    });
    t.translate({ type: "message_end", message: { role: "assistant" } });

    expect(types(delta1)).toEqual([EventType.TEXT_MESSAGE_CHUNK]);
    expect(types(delta2)).toEqual([EventType.TEXT_MESSAGE_CHUNK]);

    const m1 = (delta1[0] as any).messageId;
    const m2 = (delta2[0] as any).messageId;
    expect(m1).toBeTruthy();
    expect(m2).toBe(m1);
    expect((delta1[0] as any).delta).toBe("Hi");
    expect((delta2[0] as any).delta).toBe(" there");
  });

  it("emits a fresh messageId for a new assistant message across turns", () => {
    const t = new PiToAguiTranslator(ctx);

    t.translate({ type: "message_start", message: { role: "assistant" } });
    t.translate({
      type: "message_update",
      assistantMessageEvent: { type: "text_start", contentIndex: 0 },
    });
    const first = t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "text_delta",
        contentIndex: 0,
        delta: "a",
      },
    });
    const firstId = (first[0] as any).messageId;

    t.translate({ type: "message_end", message: { role: "assistant" } });
    t.translate({ type: "message_start", message: { role: "assistant" } });
    t.translate({
      type: "message_update",
      assistantMessageEvent: { type: "text_start", contentIndex: 0 },
    });
    const second = t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "text_delta",
        contentIndex: 0,
        delta: "b",
      },
    });
    const secondId = (second[0] as any).messageId;

    expect(secondId).not.toBe(firstId);
  });

  it("emits REASONING_MESSAGE_CHUNK for each thinking_delta with a stable messageId", () => {
    const t = new PiToAguiTranslator(ctx);

    t.translate({ type: "message_start", message: { role: "assistant" } });
    const t1 = t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "thinking_delta",
        contentIndex: 0,
        delta: "hmm",
      },
    });
    const t2 = t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "thinking_delta",
        contentIndex: 0,
        delta: " let me think",
      },
    });

    expect(types(t1)).toEqual([EventType.REASONING_MESSAGE_CHUNK]);
    expect(types(t2)).toEqual([EventType.REASONING_MESSAGE_CHUNK]);

    const r1 = (t1[0] as any).messageId;
    const r2 = (t2[0] as any).messageId;
    expect(r1).toBeTruthy();
    expect(r2).toBe(r1);
    expect((t1[0] as any).delta).toBe("hmm");
    expect((t2[0] as any).delta).toBe(" let me think");
  });

  it("uses distinct messageIds for reasoning and text within one assistant message (regression: 'reasoning + text merged in client')", () => {
    const t = new PiToAguiTranslator(ctx);

    t.translate({ type: "message_start", message: { role: "assistant" } });
    const reasoning = t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "thinking_delta",
        contentIndex: 0,
        delta: "hmm",
      },
    });
    const reasoningId = (reasoning[0] as any).messageId;

    t.translate({
      type: "message_update",
      assistantMessageEvent: { type: "text_start", contentIndex: 1 },
    });
    const text = t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "text_delta",
        contentIndex: 1,
        delta: "ok",
      },
    });
    const textId = (text[0] as any).messageId;

    expect(types(text)).toEqual([EventType.TEXT_MESSAGE_CHUNK]);
    // Reasoning and text must use distinct messageIds so the AG-UI client's
    // state machine doesn't collapse them into a single Message.
    expect(textId).not.toBe(reasoningId);
  });

  it("emits the TOOL_CALL_START/ARGS/END triad on toolcall_start/delta/end", () => {
    const t = new PiToAguiTranslator(ctx);

    t.translate({ type: "message_start", message: { role: "assistant" } });
    const tcStart = t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_start",
        contentIndex: 0,
        toolCall: { id: "tc-1", name: "bash" },
      },
    });
    const tcDelta = t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_delta",
        contentIndex: 0,
        delta: '{"command":"ls"}',
      },
    });
    const tcDelta2 = t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_delta",
        contentIndex: 0,
        delta: " -la",
      },
    });
    const tcEnd = t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_end",
        contentIndex: 0,
        toolCall: { id: "tc-1", name: "bash" },
      },
    });

    expect(types(tcStart)).toEqual([EventType.TOOL_CALL_START]);
    expect((tcStart[0] as any).toolCallId).toBe("tc-1");
    expect((tcStart[0] as any).toolCallName).toBe("bash");
    expect((tcStart[0] as any).parentMessageId).toBeTruthy();

    expect(types(tcDelta)).toEqual([EventType.TOOL_CALL_ARGS]);
    expect((tcDelta[0] as any).toolCallId).toBe("tc-1");
    expect((tcDelta[0] as any).delta).toBe('{"command":"ls"}');

    expect(types(tcDelta2)).toEqual([EventType.TOOL_CALL_ARGS]);
    expect((tcDelta2[0] as any).delta).toBe(" -la");

    expect(types(tcEnd)).toEqual([EventType.TOOL_CALL_END]);
    expect((tcEnd[0] as any).toolCallId).toBe("tc-1");
  });

  it("emits TOOL_CALL_END on message_end for any tool calls that were not explicitly closed (regression: 'tool call stuck in loading')", () => {
    const t = new PiToAguiTranslator(ctx);

    t.translate({ type: "message_start", message: { role: "assistant" } });
    t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_start",
        contentIndex: 0,
        toolCall: { id: "tc-1", name: "bash" },
      },
    });
    t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_delta",
        contentIndex: 0,
        delta: '{"command":"ls"}',
      },
    });
    // No toolcall_end — Pi sometimes doesn't send it.
    const messageEnd = t.translate({
      type: "message_end",
      message: { role: "assistant" },
    });

    expect(types(messageEnd)).toContain(EventType.TOOL_CALL_END);
    expect((messageEnd[0] as any).toolCallId).toBe("tc-1");
  });

  it("emits the closed triad in order: START, ARGS, END, then TOOL_CALL_RESULT (regression: 'infinite loading')", () => {
    const t = new PiToAguiTranslator(ctx);

    t.translate({
      type: "tool_execution_start",
      toolCallId: "tc-1",
      toolName: "bash",
    });
    t.translate({ type: "message_start", message: { role: "assistant" } });
    t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_start",
        contentIndex: 0,
        toolCall: { id: "tc-1", name: "bash" },
      },
    });
    t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_delta",
        contentIndex: 0,
        delta: '{"command":"ls"}',
      },
    });
    t.translate({ type: "message_end", message: { role: "assistant" } });
    const result = t.translate({
      type: "tool_execution_end",
      toolCallId: "tc-1",
      toolName: "bash",
      result: "ok",
      isError: false,
    });

    expect(types(result)).toEqual([
      EventType.TOOL_CALL_RESULT,
      EventType.STEP_FINISHED,
    ]);
  });

  it("emits message_end as a no-op (no manual *_END events needed)", () => {
    const t = new PiToAguiTranslator(ctx);

    t.translate({ type: "message_start", message: { role: "assistant" } });
    t.translate({
      type: "message_update",
      assistantMessageEvent: { type: "text_start", contentIndex: 0 },
    });
    t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "text_delta",
        contentIndex: 0,
        delta: "hi",
      },
    });
    const end = t.translate({
      type: "message_end",
      message: { role: "assistant" },
    });

    expect(types(end)).toEqual([]);
  });

  it("emits TOOL_CALL_RESULT immediately on tool_execution_end (no buffering, no 30s timer)", () => {
    const t = new PiToAguiTranslator(ctx);

    const execEnd = t.translate({
      type: "tool_execution_end",
      toolCallId: "tc-1",
      toolName: "read",
      result: "file content",
      isError: false,
    });

    expect(types(execEnd)).toEqual([EventType.TOOL_CALL_RESULT]);
    expect((execEnd[0] as any).toolCallId).toBe("tc-1");
    expect((execEnd[0] as any).content).toBe("file content");
    expect((execEnd[0] as any).role).toBe("tool");
  });

  it("emits TOOL_CALL_RESULT then STEP_FINISHED on tool_execution_end when tool_execution_start was seen", () => {
    const t = new PiToAguiTranslator(ctx);
    t.translate({
      type: "tool_execution_start",
      toolCallId: "tc-1",
      toolName: "bash",
    });

    const execEnd = t.translate({
      type: "tool_execution_end",
      toolCallId: "tc-1",
      toolName: "bash",
      result: "ok",
      isError: false,
    });

    expect(types(execEnd)).toEqual([
      EventType.TOOL_CALL_RESULT,
      EventType.STEP_FINISHED,
    ]);
  });

  it("emits TOOL_CALL_RESULT on message_end(toolResult) with the buffered content", () => {
    const t = new PiToAguiTranslator(ctx);

    t.translate({
      type: "message_start",
      message: {
        role: "toolResult",
        toolCallId: "tc-1",
        content: "from-message",
      },
    });
    const resultEnd = t.translate({
      type: "message_end",
      message: { role: "toolResult", toolCallId: "tc-1" },
    });

    expect(types(resultEnd)).toEqual([EventType.TOOL_CALL_RESULT]);
    expect((resultEnd[0] as any).toolCallId).toBe("tc-1");
    expect((resultEnd[0] as any).content).toBe("from-message");
    expect((resultEnd[0] as any).role).toBe("tool");
  });

  it("prefers the buffered toolResult content when both sources arrive", () => {
    const t = new PiToAguiTranslator(ctx);
    t.translate({
      type: "tool_execution_start",
      toolCallId: "tc-1",
      toolName: "read",
    });

    t.translate({
      type: "message_start",
      message: {
        role: "toolResult",
        toolCallId: "tc-1",
        content: "from-message",
      },
    });
    const resultEnd = t.translate({
      type: "message_end",
      message: { role: "toolResult", toolCallId: "tc-1" },
    });
    expect((resultEnd[0] as any).content).toBe("from-message");

    const execEnd = t.translate({
      type: "tool_execution_end",
      toolCallId: "tc-1",
      toolName: "read",
      result: "from-exec",
      isError: false,
    });
    expect(types(execEnd)).toEqual([EventType.STEP_FINISHED]);
    expect(types(execEnd)).not.toContain(EventType.TOOL_CALL_RESULT);
  });

  it("does not emit anything from tool_execution_end when the result was already emitted on message_end", () => {
    const t = new PiToAguiTranslator(ctx);

    const execEnd = t.translate({
      type: "tool_execution_end",
      toolCallId: "tc-1",
      toolName: "read",
      result: "from-exec",
      isError: false,
    });
    expect(types(execEnd)).toEqual([EventType.TOOL_CALL_RESULT]);
    expect((execEnd[0] as any).content).toBe("from-exec");

    t.translate({
      type: "message_start",
      message: {
        role: "toolResult",
        toolCallId: "tc-1",
        content: "from-message",
      },
    });
    const resultEnd = t.translate({
      type: "message_end",
      message: { role: "toolResult", toolCallId: "tc-1" },
    });
    expect(types(resultEnd)).toEqual([]);
  });

  it("does not time-out tool results (the 30s timer is gone)", () => {
    vi.useFakeTimers();
    try {
      const t = new PiToAguiTranslator(ctx);
      t.translate({
        type: "message_start",
        message: {
          role: "toolResult",
          toolCallId: "tc-1",
          content: "pending",
        },
      });

      const probe1 = t.translate({
        type: "tool_execution_update",
        toolCallId: "tc-1",
      });
      expect(types(probe1)).toEqual([]);

      vi.advanceTimersByTime(60_000);

      const probe2 = t.translate({
        type: "tool_execution_update",
        toolCallId: "tc-1",
      });
      expect(types(probe2)).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits RUN_ERROR on error events", () => {
    const t = new PiToAguiTranslator(ctx);
    const out = t.translate({ type: "error", message: "boom" });
    expect(types(out)).toEqual([EventType.RUN_ERROR]);
    expect((out[0] as any).message).toBe("boom");
  });

  it("is stateless: two translators on the same input produce the same events", () => {
    const a = new PiToAguiTranslator(ctx);
    const b = new PiToAguiTranslator(ctx);

    const sequence: any[] = [
      { type: "message_start", message: { role: "assistant" } },
      {
        type: "message_update",
        assistantMessageEvent: { type: "text_start", contentIndex: 0 },
      },
      {
        type: "message_update",
        assistantMessageEvent: {
          type: "text_delta",
          contentIndex: 0,
          delta: "hi",
        },
      },
      { type: "message_end", message: { role: "assistant" } },
    ];

    const aOut = sequence.flatMap((e) => a.translate(e));
    const bOut = sequence.flatMap((e) => b.translate(e));

    expect(types(aOut)).toEqual(types(bOut));
  });
});

describe("hydrateState (reconnect)", () => {
  it("preserves hydrated currentMessageId so text_delta is not dropped", () => {
    const t = new PiToAguiTranslator(ctx);
    const inFlightTools = new Map<number, { id: string; name: string }>();
    inFlightTools.set(0, { id: "tc-1", name: "bash" });

    t.hydrateState({
      currentMessageId: "hydrated-msg-1",
      activeToolCalls: inFlightTools,
    });

    const events = t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "text_delta",
        contentIndex: 0,
        delta: "hello reconnected",
      },
    });

    expect(types(events)).toEqual([EventType.TEXT_MESSAGE_CHUNK]);
    expect((events[0] as any).messageId).toBe("hydrated-msg-1");
    expect((events[0] as any).delta).toBe("hello reconnected");
  });

  it("preserves hydrated activeToolCalls so toolcall_delta is not dropped", () => {
    const t = new PiToAguiTranslator(ctx);
    const inFlightTools = new Map<number, { id: string; name: string }>();
    inFlightTools.set(0, { id: "tc-1", name: "bash" });

    t.hydrateState({
      currentMessageId: "hydrated-msg-1",
      activeToolCalls: inFlightTools,
    });

    const events = t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_delta",
        contentIndex: 0,
        delta: '"command":"ls"}',
      },
    });

    expect(types(events)).toEqual([EventType.TOOL_CALL_ARGS]);
    expect((events[0] as any).toolCallId).toBe("tc-1");
    expect((events[0] as any).delta).toBe('"command":"ls"}');
  });

  it("suppresses duplicate TOOL_CALL_START when the call was hydrated (reconnect)", () => {
    const t = new PiToAguiTranslator(ctx);
    const inFlightTools = new Map<number, { id: string; name: string }>();
    inFlightTools.set(0, { id: "tc-1", name: "bash" });

    t.hydrateState({
      currentMessageId: "hydrated-msg-1",
      activeToolCalls: inFlightTools,
    });

    const events = t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_start",
        contentIndex: 0,
        toolCall: { id: "tc-1", name: "bash" },
      },
    });

    expect(types(events)).toEqual([]);
  });

  it("still emits TOOL_CALL_ARGS deltas after suppressing a duplicate TOOL_CALL_START", () => {
    const t = new PiToAguiTranslator(ctx);
    const inFlightTools = new Map<number, { id: string; name: string }>();
    inFlightTools.set(0, { id: "tc-1", name: "bash" });

    t.hydrateState({
      currentMessageId: "hydrated-msg-1",
      activeToolCalls: inFlightTools,
    });

    t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_start",
        contentIndex: 0,
        toolCall: { id: "tc-1", name: "bash" },
      },
    });

    const delta = t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_delta",
        contentIndex: 0,
        delta: '"command":"ls"}',
      },
    });

    expect(types(delta)).toEqual([EventType.TOOL_CALL_ARGS]);
    expect((delta[0] as any).toolCallId).toBe("tc-1");
  });

});

describe("deterministic message ids from Pi timestamp (fixes cross-run id collisions)", () => {
  it("derives the assistant messageId as a-<timestamp> from the Pi message", () => {
    const t = new PiToAguiTranslator(ctx);
    t.translate({
      type: "message_start",
      message: { role: "assistant", timestamp: 1_700_000_000_000 },
    });
    const events = t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "text_delta",
        contentIndex: 0,
        delta: "x",
      },
    });

    expect((events[0] as any).messageId).toBe("a-1700000000000");
  });

  it("two separate translator instances (two runs) with different timestamps produce different messageIds (regression: cross-run id collision)", () => {
    const runOne = new PiToAguiTranslator(ctx);
    const runTwo = new PiToAguiTranslator(ctx);

    runOne.translate({
      type: "message_start",
      message: { role: "assistant", timestamp: 1_700_000_000_000 },
    });
    const eventsOne = runOne.translate({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "a" },
    });

    runTwo.translate({
      type: "message_start",
      message: { role: "assistant", timestamp: 1_700_000_005_000 },
    });
    const eventsTwo = runTwo.translate({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "b" },
    });

    const idOne = (eventsOne[0] as any).messageId;
    const idTwo = (eventsTwo[0] as any).messageId;
    expect(idOne).not.toBe(idTwo);
    expect(idOne).toBe("a-1700000000000");
    expect(idTwo).toBe("a-1700000005000");
  });

  it("two assistant messages in the same run sharing a millisecond timestamp get disambiguated ids", () => {
    const t = new PiToAguiTranslator(ctx);

    t.translate({
      type: "message_start",
      message: { role: "assistant", timestamp: 1_700_000_000_000 },
    });
    const first = t.translate({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "a" },
    });
    t.translate({ type: "message_end", message: { role: "assistant" } });

    t.translate({
      type: "message_start",
      message: { role: "assistant", timestamp: 1_700_000_000_000 },
    });
    const second = t.translate({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "b" },
    });

    const firstId = (first[0] as any).messageId;
    const secondId = (second[0] as any).messageId;
    expect(firstId).toBe("a-1700000000000");
    expect(secondId).toBe("a-1700000000000-2");
  });

  it("falls back to a random id (never a counter) when the Pi message has no timestamp", () => {
    const t = new PiToAguiTranslator(ctx);
    t.translate({ type: "message_start", message: { role: "assistant" } });
    const events = t.translate({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "x" },
    });
    const id = (events[0] as any).messageId as string;
    expect(id).not.toMatch(/^msg-/);
    // crypto.randomUUID() format
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("tool_execution step events", () => {
  it("emits STEP_STARTED on tool_execution_start with a unique stepName per tool call", () => {
    const t = new PiToAguiTranslator(ctx);
    const events = t.translate({
      type: "tool_execution_start",
      toolCallId: "t1",
      toolName: "bash",
    });
    const stepStarted = events.find((e) => e.type === EventType.STEP_STARTED);
    expect(stepStarted).toBeDefined();
    expect((stepStarted as unknown as { stepName: string }).stepName).toBe(
      "tool:bash:t1",
    );
    expect(
      (stepStarted as unknown as { rawEvent: { toolCallId: string } }).rawEvent
        .toolCallId,
    ).toBe("t1");
  });

  it("emits distinct stepName values for consecutive calls to the same tool (regression: 'Step already active')", () => {
    const t = new PiToAguiTranslator(ctx);

    const first = t.translate({
      type: "tool_execution_start",
      toolCallId: "call-1",
      toolName: "bash",
    });
    const firstStep = first.find((e) => e.type === EventType.STEP_STARTED) as
      | { stepName: string }
      | undefined;
    expect(firstStep).toBeDefined();

    t.translate({
      type: "tool_execution_end",
      toolCallId: "call-1",
      toolName: "bash",
      result: "ok",
      isError: false,
    });

    const second = t.translate({
      type: "tool_execution_start",
      toolCallId: "call-2",
      toolName: "bash",
    });
    const secondStep = second.find((e) => e.type === EventType.STEP_STARTED) as
      | { stepName: string }
      | undefined;
    expect(secondStep).toBeDefined();
    expect(secondStep!.stepName).not.toBe(firstStep!.stepName);
  });

  it("emits STEP_FINISHED after TOOL_CALL_RESULT on tool_execution_end", () => {
    const t = new PiToAguiTranslator(ctx);
    t.translate({
      type: "tool_execution_start",
      toolCallId: "t1",
      toolName: "bash",
    });
    const events = t.translate({
      type: "tool_execution_end",
      toolCallId: "t1",
      toolName: "bash",
      result: "ok",
      isError: false,
    });
    const evTypes = events.map((e) => e.type);
    expect(evTypes).toContain(EventType.TOOL_CALL_RESULT);
    expect(evTypes[evTypes.length - 1]).toBe(EventType.STEP_FINISHED);
    const stepFinished = events.find((e) => e.type === EventType.STEP_FINISHED);
    expect(
      (stepFinished as unknown as { rawEvent: { isError: boolean } }).rawEvent
        .isError,
    ).toBe(false);
  });

  it("emits STEP_FINISHED with the same stepName as the matching STEP_STARTED (regression: ag-ui step index)", () => {
    const t = new PiToAguiTranslator(ctx);
    const startEvents = t.translate({
      type: "tool_execution_start",
      toolCallId: "call-42",
      toolName: "bash",
    });
    const startName = (
      startEvents.find((e) => e.type === EventType.STEP_STARTED) as
        | { stepName: string }
        | undefined
    )?.stepName;
    expect(startName).toBeDefined();

    const endEvents = t.translate({
      type: "tool_execution_end",
      toolCallId: "call-42",
      toolName: "bash",
      result: "ok",
      isError: false,
    });
    const finishName = (
      endEvents.find((e) => e.type === EventType.STEP_FINISHED) as
        | { stepName: string }
        | undefined
    )?.stepName;
    expect(finishName).toBe(startName);
  });

  it("marks isError: true on STEP_FINISHED for errored tool calls", () => {
    const t = new PiToAguiTranslator(ctx);
    t.translate({
      type: "tool_execution_start",
      toolCallId: "t1",
      toolName: "bash",
    });
    const events = t.translate({
      type: "tool_execution_end",
      toolCallId: "t1",
      toolName: "bash",
      result: "exit 1",
      isError: true,
    });
    const stepFinished = events.find((e) => e.type === EventType.STEP_FINISHED);
    expect(
      (stepFinished as unknown as { rawEvent: { isError: boolean } }).rawEvent
        .isError,
    ).toBe(true);
  });

  it("skips STEP_FINISHED when tool_execution_start was not seen for this toolCallId", () => {
    const t = new PiToAguiTranslator(ctx);
    const events = t.translate({
      type: "tool_execution_end",
      toolCallId: "fresh",
      toolName: "bash",
      result: "x",
      isError: false,
    });
    expect(types(events)).toEqual([EventType.TOOL_CALL_RESULT]);
    expect(
      events.find((e) => e.type === EventType.STEP_FINISHED),
    ).toBeUndefined();
  });

  it("emits STEP_FINISHED for all active steps and clears them when agent_end is received", () => {
    const t = new PiToAguiTranslator(ctx);
    t.translate({
      type: "tool_execution_start",
      toolCallId: "t1",
      toolName: "bash",
    });
    t.translate({
      type: "tool_execution_start",
      toolCallId: "t2",
      toolName: "read",
    });

    const events = t.translate({ type: "agent_end" });
    const evTypes = events.map((e) => e.type);

    expect(evTypes).toEqual([
      EventType.STEP_FINISHED,
      EventType.STEP_FINISHED,
      EventType.RUN_FINISHED,
    ]);

    const stepFinishedEvents = events.filter((e) => e.type === EventType.STEP_FINISHED) as any[];
    expect(stepFinishedEvents).toHaveLength(2);
    expect(stepFinishedEvents[0].stepName).toBe("tool:bash:t1");
    expect(stepFinishedEvents[0].rawEvent.toolCallId).toBe("t1");
    expect(stepFinishedEvents[0].rawEvent.isError).toBe(true);

    expect(stepFinishedEvents[1].stepName).toBe("tool:read:t2");
    expect(stepFinishedEvents[1].rawEvent.toolCallId).toBe("t2");
    expect(stepFinishedEvents[1].rawEvent.isError).toBe(true);

    // Subsequent tool_execution_end should not emit duplicate STEP_FINISHED since it was cleared
    const postEvents = t.translate({
      type: "tool_execution_end",
      toolCallId: "t1",
      toolName: "bash",
      result: "ok",
      isError: false,
    });
    expect(types(postEvents)).toEqual([EventType.TOOL_CALL_RESULT]);
  });

  it("emits STEP_FINISHED for all active steps and clears them when error is received", () => {
    const t = new PiToAguiTranslator(ctx);
    t.translate({
      type: "tool_execution_start",
      toolCallId: "t1",
      toolName: "bash",
    });

    const events = t.translate({ type: "error", message: "fatal" });
    const evTypes = events.map((e) => e.type);

    expect(evTypes).toEqual([
      EventType.STEP_FINISHED,
      EventType.RUN_ERROR,
    ]);

    const stepFinished = events.find((e) => e.type === EventType.STEP_FINISHED) as any;
    expect(stepFinished).toBeDefined();
    expect(stepFinished.stepName).toBe("tool:bash:t1");
    expect(stepFinished.rawEvent.isError).toBe(true);
  });

  it("correctly maps generated/fallback toolCallId to the real toolCallId on tool_execution_start and end", () => {
    const t = new PiToAguiTranslator(ctx);

    t.translate({ type: "message_start", message: { role: "assistant" } });
    
    // 1. Stream starts a tool call without a pre-defined ID (so we generate a random one)
    const startEvents = t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_start",
        contentIndex: 0,
        toolCall: { name: "bash" }, // NO ID
      },
    });

    const generatedId = (startEvents[0] as any).toolCallId;
    expect(generatedId).toBeDefined();
    // Fallback ids collide across runs if generated from a per-instance
    // counter (the old "msg-N" scheme); they must be globally unique instead.
    expect(generatedId).not.toContain("msg-");
    expect(generatedId).toMatch(/^[0-9a-f-]{36}$/);

    t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_delta",
        contentIndex: 0,
        delta: '{"command":"ls"}',
      },
    });

    t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_end",
        contentIndex: 0,
      },
    });

    t.translate({ type: "message_end", message: { role: "assistant" } });

    // 2. tool_execution_start arrives with the real ID
    const startExecEvents = t.translate({
      type: "tool_execution_start",
      toolCallId: "call_abc123",
      toolName: "bash",
    });

    const stepStarted = startExecEvents.find((e) => e.type === EventType.STEP_STARTED);
    expect(stepStarted).toBeDefined();
    expect((stepStarted as any).stepName).toBe(`tool:bash:${generatedId}`);
    expect((stepStarted as any).rawEvent.toolCallId).toBe(generatedId);

    // 3. tool_execution_end arrives with the real ID
    const endExecEvents = t.translate({
      type: "tool_execution_end",
      toolCallId: "call_abc123",
      toolName: "bash",
      result: "ok",
      isError: false,
    });

    const toolResult = endExecEvents.find((e) => e.type === EventType.TOOL_CALL_RESULT);
    const stepFinished = endExecEvents.find((e) => e.type === EventType.STEP_FINISHED);

    expect(toolResult).toBeDefined();
    expect((toolResult as any).toolCallId).toBe(generatedId);
    expect((toolResult as any).content).toBe("ok");

    expect(stepFinished).toBeDefined();
    expect((stepFinished as any).stepName).toBe(`tool:bash:${generatedId}`);
    expect((stepFinished as any).rawEvent.toolCallId).toBe(generatedId);
  });
});

