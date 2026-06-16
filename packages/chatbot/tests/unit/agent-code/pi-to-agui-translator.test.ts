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
    const delta = t.translate({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Hi" },
    });
    const end = t.translate({
      type: "message_end",
      message: { role: "assistant" },
    });

    expect(types(start)).toEqual([EventType.TEXT_MESSAGE_START]);
    expect((start[0] as unknown as { messageId: string }).messageId).toBe(
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

    expect(types(messageStart)).toEqual([EventType.TEXT_MESSAGE_START]);
    expect(types(thinkingDelta)).toEqual([
      EventType.REASONING_START,
      EventType.REASONING_MESSAGE_START,
      EventType.REASONING_MESSAGE_CONTENT,
    ]);
    expect(types(textStart)).toEqual([
      EventType.REASONING_MESSAGE_END,
      EventType.REASONING_END,
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
    expect(types(result)).toEqual([EventType.TOOL_CALL_RESULT]);
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
    const first = t.translate({
      type: "message_start",
      message: { role: "assistant" },
    });
    const firstMessageId = (first[0] as unknown as { messageId: string })
      .messageId;
    t.translate({ type: "message_end", message: { role: "assistant" } });
    const second = t.translate({
      type: "message_start",
      message: { role: "assistant" },
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
});
