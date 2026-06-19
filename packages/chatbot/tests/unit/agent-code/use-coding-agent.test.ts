import { describe, it, expect } from "vitest";
import { EventType } from "@ag-ui/client";
import type { Message } from "@ag-ui/client";
import {
  statusFromEvent,
  type AgentStatus,
} from "@/lib/features/code/hooks/use-coding-agent";
import { groupItems } from "@/lib/features/code/group-items";

describe("statusFromEvent", () => {
  const idle: AgentStatus = { kind: "idle" };

  it("returns idle on RUN_FINISHED", () => {
    expect(
      statusFromEvent({ type: EventType.RUN_FINISHED } as never, idle),
    ).toEqual({ kind: "idle" });
  });

  it("returns thinking on REASONING_START", () => {
    expect(
      statusFromEvent(
        { type: EventType.REASONING_START, messageId: "r1" } as never,
        idle,
      ),
    ).toEqual({ kind: "thinking" });
  });

  it("returns writing on TEXT_MESSAGE_CONTENT", () => {
    expect(
      statusFromEvent(
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: "m1",
          delta: "hi",
        } as never,
        idle,
      ),
    ).toEqual({ kind: "writing" });
  });

  it("returns tool_calling on TOOL_CALL_START and keeps the tool name", () => {
    expect(
      statusFromEvent(
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: "t1",
          toolCallName: "bash",
        } as never,
        idle,
      ),
    ).toEqual({ kind: "tool_calling", toolName: "bash", toolCallId: "t1" });
  });

  it("defaults tool name to 'tool' when TOOL_CALL_START has no toolCallName", () => {
    expect(
      statusFromEvent(
        { type: EventType.TOOL_CALL_START, toolCallId: "t1" } as never,
        idle,
      ),
    ).toEqual({ kind: "tool_calling", toolName: "tool", toolCallId: "t1" });
  });

  it("returns thinking on TOOL_CALL_END", () => {
    expect(
      statusFromEvent(
        { type: EventType.TOOL_CALL_END, toolCallId: "t1" } as never,
        { kind: "tool_calling", toolName: "bash" },
      ),
    ).toEqual({ kind: "thinking" });
  });

  it("returns thinking on TOOL_CALL_RESULT", () => {
    expect(
      statusFromEvent(
        { type: EventType.TOOL_CALL_RESULT, toolCallId: "t1" } as never,
        { kind: "tool_calling", toolName: "bash" },
      ),
    ).toEqual({ kind: "thinking" });
  });

  it("preserves current status on TEXT_MESSAGE_END", () => {
    const writing: AgentStatus = { kind: "writing" };
    expect(
      statusFromEvent(
        { type: EventType.TEXT_MESSAGE_END, messageId: "m1" } as never,
        writing,
      ),
    ).toEqual({ kind: "writing" });
  });

  it("preserves current status for unrelated events", () => {
    const writing: AgentStatus = { kind: "writing" };
    expect(
      statusFromEvent({ type: "CUSTOM", name: "ping" } as never, writing),
    ).toEqual({ kind: "writing" });
  });
});

describe("AgentStatus extensions", () => {
  it("returns step_running on StepStarted", () => {
    expect(
      statusFromEvent(
        {
          type: EventType.STEP_STARTED,
          stepName: "tool:bash",
        } as never,
        { kind: "thinking" },
      ),
    ).toEqual({ kind: "step_running", stepName: "tool:bash" });
  });

  it("returns thinking on StepFinished", () => {
    expect(
      statusFromEvent(
        { type: EventType.STEP_FINISHED, stepName: "tool:bash" } as never,
        { kind: "step_running", stepName: "tool:bash" },
      ),
    ).toEqual({ kind: "thinking" });
  });
});

describe("groupItems integration (smoke)", () => {
  it("returns [] for empty input", () => {
    expect(groupItems([])).toEqual([]);
  });

  it("pairs tool results with tool calls", () => {
    const messages: Message[] = [
      {
        id: "a1",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "t1",
            type: "function",
            function: { name: "bash", arguments: '{"command":"ls"}' },
          } as never,
        ],
      } as Message,
      { id: "r1", role: "tool", toolCallId: "t1", content: "a.txt" } as Message,
    ];
    const items = groupItems(messages);
    if (items[0].kind !== "assistant") throw new Error("expected assistant");
    expect(items[0].toolGroups[0].result).toBe("a.txt");
  });
});
