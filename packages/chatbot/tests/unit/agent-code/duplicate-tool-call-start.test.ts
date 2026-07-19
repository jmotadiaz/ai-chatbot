import { EventType, type BaseEvent, type Message } from "@ag-ui/client";
import { describe, it, expect } from "vitest";

import { isDuplicateToolCallStart } from "@/lib/features/code/hooks/use-coding-agent";

function toolCallStart(toolCallId: string): BaseEvent {
  return {
    type: EventType.TOOL_CALL_START,
    toolCallId,
    toolCallName: "write",
  } as BaseEvent;
}

const messages = [
  { id: "u1", role: "user", content: "hola" },
  {
    id: "a1",
    role: "assistant",
    toolCalls: [
      { id: "t1", type: "function", function: { name: "write", arguments: '{"pa' } },
    ],
  },
] as unknown as Message[];

describe("isDuplicateToolCallStart", () => {
  it("suppresses a synthetic start for a tool call already in the messages", () => {
    expect(isDuplicateToolCallStart(messages, toolCallStart("t1"))).toBe(true);
  });

  it("lets a genuinely new tool call through", () => {
    expect(isDuplicateToolCallStart(messages, toolCallStart("t2"))).toBe(false);
  });

  it("lets events without a toolCallId through", () => {
    expect(
      isDuplicateToolCallStart(messages, { type: EventType.TOOL_CALL_START } as BaseEvent),
    ).toBe(false);
  });
});
