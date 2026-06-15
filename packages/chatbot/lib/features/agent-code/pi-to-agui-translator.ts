import { EventType, type BaseEvent } from "@ag-ui/client";
import { getTraceLogger } from "tracing";

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
  const log = getTraceLogger("bridge");
  const { threadId, runId } = context;

  let result: BaseEvent;

  switch (piEvent.type) {
    case "agent_start":
      result = {
        type: EventType.RUN_STARTED,
        threadId,
        runId,
        timestamp: Date.now(),
      } as BaseEvent;
      break;
    case "agent_end":
      result = {
        type: EventType.RUN_FINISHED,
        threadId,
        runId,
        timestamp: Date.now(),
      } as BaseEvent;
      break;
    case "message_start":
      result = {
        type: EventType.TEXT_MESSAGE_START,
        messageId: piEvent.messageId ?? "msg-1",
        role: "assistant",
        timestamp: Date.now(),
      } as BaseEvent;
      break;
    case "message_update":
      if (piEvent.assistantMessageEvent.type === "text_delta") {
        result = {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: "msg-1",
          delta: piEvent.assistantMessageEvent.delta,
          timestamp: Date.now(),
        } as BaseEvent;
      } else {
        result = { type: EventType.RAW, payload: piEvent } as BaseEvent;
      }
      break;
    case "message_end":
      result = {
        type: EventType.TEXT_MESSAGE_END,
        messageId: piEvent.messageId ?? "msg-1",
        timestamp: Date.now(),
      } as BaseEvent;
      break;
    case "tool_execution_start":
      result = {
        type: EventType.TOOL_CALL_START,
        toolCallId: piEvent.toolCallId ?? "tool-1",
        toolCallName: piEvent.toolName,
        timestamp: Date.now(),
      } as BaseEvent;
      break;
    case "tool_execution_update":
      result = {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: piEvent.toolCallId ?? "tool-1",
        delta: piEvent.output ?? "",
        timestamp: Date.now(),
      } as BaseEvent;
      break;
    case "tool_execution_end":
      result = {
        type: EventType.TOOL_CALL_RESULT,
        messageId: "msg-1",
        toolCallId: piEvent.toolCallId ?? "tool-1",
        content: typeof piEvent.result === "string"
          ? piEvent.result
          : JSON.stringify(piEvent.result ?? ""),
        timestamp: Date.now(),
      } as BaseEvent;
      break;
    case "error":
      result = {
        type: EventType.RUN_ERROR,
        threadId,
        runId,
        message: piEvent.message,
        timestamp: Date.now(),
      } as BaseEvent;
      break;
    default:
      log.debug("translate.unknown_type", { piType: (piEvent as { type: string }).type });
      result = { type: EventType.RAW, payload: piEvent } as BaseEvent;
  }

  log.debug("translate", { piType: piEvent.type, aguiType: result.type });
  return result;
}
