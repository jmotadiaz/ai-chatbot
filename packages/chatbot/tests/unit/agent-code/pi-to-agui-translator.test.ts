import { describe, it, expect } from "vitest";
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
});
