/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { EventType } from "@ag-ui/client";
import { PiToAguiTranslator } from "@/lib/features/agent-code/pi-to-agui-translator";

const ctx = { threadId: "thread-1", runId: "run-1" };

function types(events: Array<{ type: string }>) {
  return events.map((e) => e.type);
}

describe("pi-to-agui-translator", () => {
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

  it("emits TEXT_MESSAGE_START, CONTENT, END across one assistant message", () => {
    const t = new PiToAguiTranslator(ctx);
    const messageId = "msg-1";

    const start = t.translate({
      type: "message_start",
      message: { role: "assistant" },
    });
    const textStart = t.translate({
      type: "message_update",
      assistantMessageEvent: { type: "text_start", contentIndex: 0 },
    });
    const delta = t.translate({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Hi" },
    });
    const end = t.translate({
      type: "message_end",
      message: { role: "assistant" },
    });

    expect(types(start)).toEqual([]);
    expect(types(textStart)).toEqual([EventType.TEXT_MESSAGE_START]);
    expect((textStart[0] as unknown as { messageId: string }).messageId).toBe(
      messageId,
    );
    expect(types(delta)).toEqual([EventType.TEXT_MESSAGE_CONTENT]);
    expect(
      (delta[0] as unknown as { messageId: string; delta: string }).messageId,
    ).toBe(messageId);
    expect((delta[0] as unknown as { messageId: string; delta: string }).delta).toBe(
      "Hi",
    );
    expect(types(end)).toEqual([EventType.TEXT_MESSAGE_END]);
    expect((end[0] as unknown as { messageId: string }).messageId).toBe(
      messageId,
    );
  });

  it("emits REASONING_* for thinking_delta and closes the reasoning block on text_start", () => {
    const t = new PiToAguiTranslator(ctx);

    const messageStart = t.translate({
      type: "message_start",
      message: { role: "assistant" },
    });
    const thinkingDelta = t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "thinking_delta",
        contentIndex: 0,
        delta: "hmm",
      },
    });
    const textStart = t.translate({
      type: "message_update",
      assistantMessageEvent: { type: "text_start", contentIndex: 1 },
    });
    const textDelta = t.translate({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", contentIndex: 1, delta: "ok" },
    });

    expect(types(messageStart)).toEqual([]);
    expect(types(thinkingDelta)).toEqual([
      EventType.REASONING_START,
      EventType.REASONING_MESSAGE_START,
      EventType.REASONING_MESSAGE_CONTENT,
    ]);
    expect(types(textStart)).toEqual([
      EventType.REASONING_MESSAGE_END,
      EventType.REASONING_END,
      EventType.TEXT_MESSAGE_START,
    ]);
    expect(types(textDelta)).toEqual([EventType.TEXT_MESSAGE_CONTENT]);
  });

  it("emits TOOL_CALL_START/ARGS/END inside an assistant message and TOOL_CALL_RESULT on tool_execution_end", () => {
    const t = new PiToAguiTranslator(ctx);

    t.translate({ type: "message_start", message: { role: "assistant" } });
    t.translate({
      type: "message_update",
      assistantMessageEvent: { type: "text_start", contentIndex: 0 },
    });
    const tcStart = t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_start",
        contentIndex: 1,
        toolCall: { id: "tc-1", name: "bash" },
      },
    });
    const tcDelta = t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_delta",
        contentIndex: 1,
        delta: '{"command":"ls"}',
      },
    });
    const tcEnd = t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_end",
        contentIndex: 1,
        toolCall: { id: "tc-1", name: "bash" },
      },
    });
    const messageEnd = t.translate({ type: "message_end", message: { role: "assistant" } });
    t.translate({ type: "tool_execution_start", toolCallId: "tc-1", toolName: "bash" });
    const result = t.translate({
      type: "tool_execution_end",
      toolCallId: "tc-1",
      toolName: "bash",
      result: "ok",
      isError: false,
    });

    expect(types(tcStart)).toEqual([EventType.TOOL_CALL_START]);
    expect((tcStart[0] as unknown as { toolCallId: string }).toolCallId).toBe(
      "tc-1",
    );
    expect(
      (tcStart[0] as unknown as { parentMessageId?: string }).parentMessageId,
    ).toBe("msg-1");
    expect(types(tcDelta)).toEqual([EventType.TOOL_CALL_ARGS]);
    expect(
      (tcDelta[0] as unknown as { toolCallId: string; delta: string }).delta,
    ).toBe('{"command":"ls"}');
    expect(types(tcEnd)).toEqual([]);
    expect(types(messageEnd)).toEqual([
      EventType.TOOL_CALL_END,
      EventType.TEXT_MESSAGE_END,
    ]);
    expect(types(result)).toEqual([
      EventType.TOOL_CALL_RESULT,
      EventType.STEP_FINISHED,
    ]);
    expect(
      (result[0] as unknown as { toolCallId: string; content: string }).content,
    ).toBe("ok");
  });

  it("buffers toolResult content on message_start and emits TOOL_CALL_RESULT on message_end", () => {
    const t = new PiToAguiTranslator(ctx);

    const resultStart = t.translate({
      type: "message_start",
      message: {
        role: "toolResult",
        toolCallId: "tc-1",
        content: "file content here",
      },
    });
    expect(types(resultStart)).toEqual([]);

    const resultEnd = t.translate({
      type: "message_end",
      message: { role: "toolResult", toolCallId: "tc-1" },
    });

    expect(types(resultEnd)).toEqual([EventType.TOOL_CALL_RESULT]);
    const ev = resultEnd[0] as unknown as {
      toolCallId: string;
      content: string;
      role: string;
    };
    expect(ev.toolCallId).toBe("tc-1");
    expect(ev.content).toBe("file content here");
    expect(ev.role).toBe("tool");
  });

  it("emits TOOL_CALL_RESULT once when message events arrive before tool_execution_end", () => {
    const t = new PiToAguiTranslator(ctx);

    t.translate({
      type: "message_start",
      message: { role: "toolResult", toolCallId: "tc-1", content: "from-message" },
    });
    const resultEnd = t.translate({
      type: "message_end",
      message: { role: "toolResult", toolCallId: "tc-1" },
    });
    expect(types(resultEnd)).toEqual([EventType.TOOL_CALL_RESULT]);
    expect((resultEnd[0] as any).content).toBe("from-message");

    const execEnd = t.translate({
      type: "tool_execution_end",
      toolCallId: "tc-1",
      toolName: "read",
      result: "from-exec",
      isError: false,
    });

    expect(types(execEnd)).toEqual([]);
  });

  it("emits TOOL_CALL_RESULT once when tool_execution_end arrives before message events", () => {
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
      message: { role: "toolResult", toolCallId: "tc-1", content: "from-message" },
    });
    const resultEnd = t.translate({
      type: "message_end",
      message: { role: "toolResult", toolCallId: "tc-1" },
    });
    expect(types(resultEnd)).toEqual([]);
  });

  it("supports concurrent tool calls correctly", () => {
    const t = new PiToAguiTranslator(ctx);

    // Start both
    t.translate({
      type: "message_start",
      message: { role: "toolResult", toolCallId: "tc-1", content: "res-1" },
    });
    t.translate({
      type: "message_start",
      message: { role: "toolResult", toolCallId: "tc-2", content: "res-2" },
    });

    // End tc-2 first
    const execEnd2 = t.translate({
      type: "tool_execution_end",
      toolCallId: "tc-2",
      toolName: "read",
      result: "exec-2",
      isError: false,
    });
    expect(types(execEnd2)).toEqual([EventType.TOOL_CALL_RESULT]);
    expect((execEnd2[0] as any).toolCallId).toBe("tc-2");
    expect((execEnd2[0] as any).content).toBe("res-2"); // uses richer message content

    // End tc-1 next
    const execEnd1 = t.translate({
      type: "tool_execution_end",
      toolCallId: "tc-1",
      toolName: "read",
      result: "exec-1",
      isError: false,
    });
    expect(types(execEnd1)).toEqual([EventType.TOOL_CALL_RESULT]);
    expect((execEnd1[0] as any).toolCallId).toBe("tc-1");
    expect((execEnd1[0] as any).content).toBe("res-1"); // uses richer message content
  });

  it("emits TOOL_CALL_RESULT from tool_execution_end when no toolResult message arrived (fallback)", () => {
    const t = new PiToAguiTranslator(ctx);

    const execEnd = t.translate({
      type: "tool_execution_end",
      toolCallId: "tc-orphan",
      toolName: "bash",
      result: "ok",
      isError: false,
    });

    expect(types(execEnd)).toEqual([EventType.TOOL_CALL_RESULT]);
    expect(
      (execEnd[0] as unknown as { toolCallId: string; content: string }).content,
    ).toBe("ok");
  });

  it("uses a fresh messageId for each new assistant message across turns", () => {
    const t = new PiToAguiTranslator(ctx);
    t.translate({
      type: "message_start",
      message: { role: "assistant" },
    });
    t.translate({
      type: "message_update",
      assistantMessageEvent: { type: "text_start", contentIndex: 0 },
    });
    const first = t.translate({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "a" },
    });
    const firstMessageId = (first[0] as unknown as { messageId: string })
      .messageId;
    t.translate({ type: "message_end", message: { role: "assistant" } });
    t.translate({
      type: "message_start",
      message: { role: "assistant" },
    });
    t.translate({
      type: "message_update",
      assistantMessageEvent: { type: "text_start", contentIndex: 0 },
    });
    const second = t.translate({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "b" },
    });
    const secondMessageId = (second[0] as unknown as { messageId: string })
      .messageId;
    expect(secondMessageId).not.toBe(firstMessageId);
  });

  it("flushes orphaned tool results after 30-second timeout", () => {
    vi.useFakeTimers();
    try {
      const t = new PiToAguiTranslator(ctx);
      t.translate({
        type: "message_start",
        message: { role: "toolResult", toolCallId: "tc-1", content: "timedout-result" },
      });

      // No emission immediately
      const out1 = t.translate({ type: "tool_execution_update", toolCallId: "tc-1" });
      expect(types(out1)).toEqual([]);

      // Advance time by 31 seconds
      vi.advanceTimersByTime(31000);

      // Next event triggers the flush
      const out2 = t.translate({ type: "tool_execution_update", toolCallId: "tc-1" });
      expect(types(out2)).toEqual([EventType.TOOL_CALL_RESULT]);
      expect((out2[0] as any).content).toBe("timedout-result");
    } finally {
      vi.useRealTimers();
    }
  });

  it("flushes all buffered results on agent_end", () => {
    const t = new PiToAguiTranslator(ctx);
    t.translate({
      type: "message_start",
      message: { role: "toolResult", toolCallId: "tc-1", content: "timedout-result" },
    });

    const end = t.translate({ type: "agent_end" });
    expect(types(end)).toEqual([EventType.TOOL_CALL_RESULT, EventType.RUN_FINISHED]);
    expect((end[0] as any).content).toBe("timedout-result");
  });

  it("emits REASONING_* before TEXT_MESSAGE_START so reasoning renders before the assistant text", () => {
    const t = new PiToAguiTranslator(ctx);

    t.translate({ type: "message_start", message: { role: "assistant" } });
    t.translate({
      type: "message_update",
      assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "let me think" },
    });
    const textStart = t.translate({
      type: "message_update",
      assistantMessageEvent: { type: "text_start", contentIndex: 1 },
    });

    const textStartIdx = textStart.findIndex(
      (e) => e.type === EventType.TEXT_MESSAGE_START,
    );
    const reasoningEndIdx = textStart.findIndex(
      (e) => e.type === EventType.REASONING_END,
    );

    expect(reasoningEndIdx).toBeGreaterThanOrEqual(0);
    expect(textStartIdx).toBeGreaterThanOrEqual(0);
    expect(reasoningEndIdx).toBeLessThan(textStartIdx);
  });

  it("emits TOOL_CALL_START with parentMessageId even when TEXT_MESSAGE_START hasn't been emitted yet", () => {
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

    expect(types(tcStart)).toEqual([EventType.TOOL_CALL_START]);
    expect(
      (tcStart[0] as unknown as { parentMessageId?: string }).parentMessageId,
    ).toBe("msg-1");
  });

  it("does not emit TEXT_MESSAGE_END when the message had no text content (reasoning + tool calls only)", () => {
    const t = new PiToAguiTranslator(ctx);

    t.translate({ type: "message_start", message: { role: "assistant" } });
    t.translate({
      type: "message_update",
      assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "hmm" },
    });
    t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_start",
        contentIndex: 1,
        toolCall: { id: "tc-1", name: "bash" },
      },
    });
    t.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_end",
        contentIndex: 1,
        toolCall: { id: "tc-1", name: "bash" },
      },
    });
    const end = t.translate({ type: "message_end", message: { role: "assistant" } });

    expect(types(end)).toEqual([
      EventType.REASONING_MESSAGE_END,
      EventType.REASONING_END,
      EventType.TOOL_CALL_END,
    ]);
    expect(types(end)).not.toContain(EventType.TEXT_MESSAGE_END);
  });
});

describe("tool_execution step events", () => {
  it("emits StepStarted on tool_execution_start with a unique stepName per tool call", () => {
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

    // End the first call before starting the second one, to mirror the
    // observed server-side ordering and the AG-UI validation contract.
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

  it("emits StepFinished after ToolCallResult on tool_execution_end", () => {
    const t = new PiToAguiTranslator(ctx);
    t.translate({ type: "tool_execution_start", toolCallId: "t1", toolName: "bash" });
    const events = t.translate({
      type: "tool_execution_end",
      toolCallId: "t1",
      toolName: "bash",
      result: "ok",
      isError: false,
    });
    const types = events.map((e) => e.type);
    expect(types).toContain(EventType.TOOL_CALL_RESULT);
    expect(types[types.length - 1]).toBe(EventType.STEP_FINISHED);
    const stepFinished = events.find((e) => e.type === EventType.STEP_FINISHED);
    expect(
      (stepFinished as unknown as { rawEvent: { isError: boolean } }).rawEvent
        .isError,
    ).toBe(false);
  });

  it("emits StepFinished with the same stepName as the matching StepStarted (regression: ag-ui step index)", () => {
    const t = new PiToAguiTranslator(ctx);
    const startEvents = t.translate({
      type: "tool_execution_start",
      toolCallId: "call-42",
      toolName: "bash",
    });
    const startName = (startEvents.find((e) => e.type === EventType.STEP_STARTED) as
      | { stepName: string }
      | undefined)?.stepName;
    expect(startName).toBeDefined();

    const endEvents = t.translate({
      type: "tool_execution_end",
      toolCallId: "call-42",
      toolName: "bash",
      result: "ok",
      isError: false,
    });
    const finishName = (endEvents.find((e) => e.type === EventType.STEP_FINISHED) as
      | { stepName: string }
      | undefined)?.stepName;
    expect(finishName).toBe(startName);
  });

  it("marks isError: true on StepFinished for errored tool calls", () => {
    const t = new PiToAguiTranslator(ctx);
    t.translate({ type: "tool_execution_start", toolCallId: "t1", toolName: "bash" });
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

  it("skips StepFinished when tool_execution_start was not seen for this toolCallId", () => {
    const t = new PiToAguiTranslator(ctx);
    const events = t.translate({
      type: "tool_execution_end",
      toolCallId: "fresh",
      toolName: "bash",
      result: "x",
      isError: false,
    });
    expect(types(events)).toEqual([EventType.TOOL_CALL_RESULT]);
    expect(events.find((e) => e.type === EventType.STEP_FINISHED)).toBeUndefined();
  });
});
