import { describe, it, expect } from "vitest";
import { EventType } from "@ag-ui/client";
import { translatePiEvent } from "@/lib/features/agent-code/pi-to-agui-translator";

describe("pi-to-agui-translator", () => {
  const context = { threadId: "thread-1", runId: "run-1" };

  it("translates text_delta to TEXT_MESSAGE_CONTENT", () => {
    const event = translatePiEvent(
      {
        type: "message_update",
        assistantMessageEvent: { type: "text_delta", delta: "Hello" },
      },
      context,
    );
    expect(event.type).toBe(EventType.TEXT_MESSAGE_CONTENT);
    expect((event as unknown as { delta: string }).delta).toBe("Hello");
  });

  it("translates agent_start to RUN_STARTED", () => {
    const event = translatePiEvent({ type: "agent_start" }, context);
    expect(event.type).toBe(EventType.RUN_STARTED);
  });

  it("translates tool_execution_start to TOOL_CALL_START", () => {
    const event = translatePiEvent(
      {
        type: "tool_execution_start",
        toolName: "bash",
      },
      context,
    );
    expect(event.type).toBe(EventType.TOOL_CALL_START);
    expect((event as unknown as { toolCallName: string }).toolCallName).toBe(
      "bash",
    );
  });
});
