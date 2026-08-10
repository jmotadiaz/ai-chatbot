import { describe, it, expect } from "vitest";
import {
  assistantMessageId,
  reasoningMessageId,
  userMessageId,
  toolResultMessageId,
  IdDeduper,
} from "../../src/message-ids";
import { PiToAguiTranslator, type BaseEvent } from "../../src/pi-to-agui-translator";

type MessageIdEvent = BaseEvent & { messageId: string };

describe("message-ids helpers", () => {
  it("assistantMessageId derives a-<timestamp>", () => {
    expect(assistantMessageId(1_700_000_000_000)).toBe("a-1700000000000");
  });

  it("userMessageId derives u-<timestamp>", () => {
    expect(userMessageId(1_700_000_000_000)).toBe("u-1700000000000");
  });

  it("reasoningMessageId derives <assistantId>-reason", () => {
    expect(reasoningMessageId("a-1700000000000")).toBe("a-1700000000000-reason");
  });

  it("toolResultMessageId derives tool-result-<toolCallId>, from the real stable tool call id", () => {
    expect(toolResultMessageId("call_abc123")).toBe("tool-result-call_abc123");
  });

  it("assistantMessageId/userMessageId are pure and deterministic: same timestamp in -> same id out", () => {
    expect(assistantMessageId(42)).toBe(assistantMessageId(42));
    expect(userMessageId(42)).toBe(userMessageId(42));
  });

  it("assistantMessageId differs for different timestamps (fixes cross-run id collisions)", () => {
    expect(assistantMessageId(1)).not.toBe(assistantMessageId(2));
  });
});

describe("IdDeduper", () => {
  it("returns the base id unchanged on first use", () => {
    const d = new IdDeduper();
    expect(d.dedupe("a-1")).toBe("a-1");
  });

  it("suffixes -2, -3, ... on repeated base ids, deterministically", () => {
    const d = new IdDeduper();
    expect(d.dedupe("a-1")).toBe("a-1");
    expect(d.dedupe("a-1")).toBe("a-1-2");
    expect(d.dedupe("a-1")).toBe("a-1-3");
  });

  it("tracks each base id independently", () => {
    const d = new IdDeduper();
    expect(d.dedupe("a-1")).toBe("a-1");
    expect(d.dedupe("a-2")).toBe("a-2");
    expect(d.dedupe("a-1")).toBe("a-1-2");
  });

  it("given the same sequence of base ids, always produces the same sequence of output ids", () => {
    const sequence = ["a-1", "a-2", "a-1", "a-1", "a-3", "a-2"];
    const runOutputs = (): string[] => {
      const d = new IdDeduper();
      return sequence.map((id) => d.dedupe(id));
    };
    expect(runOutputs()).toEqual(runOutputs());
  });
});

describe("translator and history-load derive the same id for the same Pi message", () => {
  it("the live translator's assistant messageId equals assistantMessageId(msg.timestamp) — the same computation getSessionMessages performs on reload", () => {
    const timestamp = 1_700_000_123_456;
    const t = new PiToAguiTranslator({ threadId: "t1", runId: "r1" });

    t.translate({
      type: "message_start",
      message: { role: "assistant", timestamp },
    });
    const events = t.translate({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "hi" },
    });

    const liveId = (events[0] as MessageIdEvent).messageId;
    // This is exactly what getSessionMessages (session-manager.ts) computes
    // for the same Pi message when loading history from disk/memory.
    const loadId = assistantMessageId(timestamp);
    expect(liveId).toBe(loadId);
  });

  it("the live translator's tool result messageId equals toolResultMessageId(toolCallId) — the same computation getSessionMessages performs on reload", () => {
    const t = new PiToAguiTranslator({ threadId: "t1", runId: "r1" });

    const events = t.translate({
      type: "tool_execution_end",
      toolCallId: "call_xyz",
      toolName: "bash",
      result: "ok",
      isError: false,
    });

    const toolResult = events.find((e) => e.type === "TOOL_CALL_RESULT") as MessageIdEvent;
    expect(toolResult.messageId).toBe(toolResultMessageId("call_xyz"));
  });
});
