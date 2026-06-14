import { EventType, type BaseEvent } from "@ag-ui/client";

type PiEvent =
  | { type: "agent_start" }
  | { type: "agent_end" }
  | { type: "message_start"; messageId?: string }
  | { type: "message_end"; messageId?: string }
  | {
      type: "message_update";
      assistantMessageEvent:
        | { type: "text_delta"; delta: string }
        | { type: "thinking_delta"; delta: string };
    }
  | { type: "tool_execution_start"; toolName: string; toolCallId?: string }
  | { type: "tool_execution_update"; toolCallId?: string; output?: string }
  | {
      type: "tool_execution_end";
      toolCallId?: string;
      isError?: boolean;
      result?: unknown;
    }
  | { type: "error"; message: string };

export function translatePiEvent(
  piEvent: PiEvent,
  context: { threadId: string; runId: string },
): BaseEvent {
  const { threadId, runId } = context;
  switch (piEvent.type) {
    case "agent_start":
      return {
        type: EventType.RUN_STARTED,
        threadId,
        runId,
        timestamp: Date.now(),
      } as BaseEvent;
    case "agent_end":
      return {
        type: EventType.RUN_FINISHED,
        threadId,
        runId,
        timestamp: Date.now(),
      } as BaseEvent;
    case "message_start":
      return {
        type: EventType.TEXT_MESSAGE_START,
        messageId: piEvent.messageId ?? "msg-1",
        role: "assistant",
        timestamp: Date.now(),
      } as BaseEvent;
    case "message_update":
      if (piEvent.assistantMessageEvent.type === "text_delta") {
        return {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: "msg-1",
          delta: piEvent.assistantMessageEvent.delta,
          timestamp: Date.now(),
        } as BaseEvent;
      }
      return { type: EventType.RAW, payload: piEvent } as BaseEvent;
    case "message_end":
      return {
        type: EventType.TEXT_MESSAGE_END,
        messageId: piEvent.messageId ?? "msg-1",
        timestamp: Date.now(),
      } as BaseEvent;
    case "tool_execution_start":
      return {
        type: EventType.TOOL_CALL_START,
        toolCallId: piEvent.toolCallId ?? "tool-1",
        toolCallName: piEvent.toolName,
        timestamp: Date.now(),
      } as BaseEvent;
    case "tool_execution_update":
      return {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: piEvent.toolCallId ?? "tool-1",
        args: piEvent.output ?? "",
        timestamp: Date.now(),
      } as BaseEvent;
    case "tool_execution_end":
      return {
        type: EventType.TOOL_CALL_RESULT,
        messageId: "msg-1",
        toolCallId: piEvent.toolCallId ?? "tool-1",
        content: piEvent.result ?? "",
        timestamp: Date.now(),
      } as BaseEvent;
    case "error":
      return {
        type: EventType.RUN_ERROR,
        threadId,
        runId,
        message: piEvent.message,
        timestamp: Date.now(),
      } as BaseEvent;
    default:
      return { type: EventType.RAW, payload: piEvent } as BaseEvent;
  }
}
