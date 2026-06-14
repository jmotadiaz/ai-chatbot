import { describe, it, expect } from "vitest";
import { translatePiEvent } from "@/lib/features/agent-code/pi-to-agui-translator";
import { EventType } from "@ag-ui/client";

describe("pi-to-agui-translator", () => {
  it("translates text_delta to TEXT_MESSAGE_CONTENT", () => {
    const event = translatePiEvent({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "Hello" },
    });
    expect(event.type).toBe(EventType.TEXT_MESSAGE_CONTENT);
    expect((event as { delta: string }).delta).toBe("Hello");
  });

  it("translates agent_start to RUN_STARTED", () => {
    const event = translatePiEvent({ type: "agent_start" });
    expect(event.type).toBe(EventType.RUN_STARTED);
  });

  it("translates tool_execution_start to TOOL_CALL_START", () => {
    const event = translatePiEvent({
      type: "tool_execution_start",
      toolName: "bash",
    });
    expect(event.type).toBe(EventType.TOOL_CALL_START);
    expect((event as { toolCallName: string }).toolCallName).toBe("bash");
  });
});
