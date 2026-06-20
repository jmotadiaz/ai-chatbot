import { EventType, type BaseEvent } from "@ag-ui/client";
import { getTraceLogger } from "tracing";
import type {
  CodingAgentEvent,
  ContentBlock,
  RelaxedToolCall,
} from "coding-agent";

function isToolCall(block: ContentBlock | undefined): block is RelaxedToolCall {
  return block !== undefined && (block.type === "toolCall" || "id" in block);
}

export interface TranslatorContext {
  threadId: string;
  runId: string;
}

interface BufferedToolResult {
  content: string;
}

/**
 * Near-stateless translator from Pi SDK events to AG-UI events.
 *
 * The translator relies on the AG-UI client's "convenience chunk events"
 * (`TEXT_MESSAGE_CHUNK`, `REASONING_MESSAGE_CHUNK`, `TOOL_CALL_CHUNK`) which
 * the client auto-expands into the full START / CONTENT / END triads. The
 * translator therefore only needs a small amount of state to:
 *
 *   1. Bind Pi's per-message deltas to a stable `messageId` for the duration
 *      of the message (set on `message_start`, cleared on `message_end`).
 *   2. Carry a single in-flight `toolCallId`/`toolCallName` from
 *      `toolcall_start` to subsequent `toolcall_delta` events.
 *   3. Buffer a tool result's content if Pi delivers it as a message
 *      (`message_start`/`message_end` with `role: "toolResult"`).
 *   4. Remember the `stepName` used on `STEP_STARTED` so the matching
 *      `STEP_FINISHED` can reuse it (the AG-UI client pairs them by name).
 *
 * The 30-second timeout and all the manual "flush" logic from the previous
 * stateful version are gone: tool results are emitted as soon as Pi notifies
 * that the tool execution has finished (`tool_execution_end`) or as soon as
 * the `toolResult` message closes (`message_end`).
 */
export class PiToAguiTranslator {
  private currentMessageId: string | null = null;
  private openToolCallIds: string[] = [];
  private toolResultBuffer = new Map<string, BufferedToolResult>();
  private emittedToolResults = new Set<string>();
  private stepNames = new Map<string, string>();
  private messageCounter = 0;

  constructor(private readonly context: TranslatorContext) {}

  private nextMessageId(): string {
    this.messageCounter += 1;
    return `msg-${this.messageCounter}`;
  }

  private nextToolMessageId(): string {
    this.messageCounter += 1;
    return `tool-msg-${this.messageCounter}`;
  }

  private now(): number {
    return Date.now();
  }

  private extractToolResult(
    raw: string | unknown[] | undefined,
    fallback: unknown,
  ): string {
    if (typeof raw === "string") return raw;
    if (raw === undefined || raw === null) {
      return typeof fallback === "string"
        ? fallback
        : JSON.stringify(fallback ?? "");
    }
    return JSON.stringify(raw);
  }

  translate(event: CodingAgentEvent): BaseEvent[] {
    const log = getTraceLogger("bridge");
    const { threadId, runId } = this.context;
    const out: BaseEvent[] = [];
    const eventType = event.type;

    switch (event.type) {
      case "agent_start":
        out.push({
          type: EventType.RUN_STARTED,
          threadId,
          runId,
          timestamp: this.now(),
        } as BaseEvent);
        break;

      case "agent_end":
        out.push({
          type: EventType.RUN_FINISHED,
          threadId,
          runId,
          timestamp: this.now(),
        } as BaseEvent);
        break;

      case "message_start": {
        const role = event.message?.role;
        if (role === "toolResult") {
          const toolCallId = event.message?.toolCallId;
          if (toolCallId) {
            this.toolResultBuffer.set(toolCallId, {
              content: this.extractToolResult(event.message?.content, ""),
            });
          }
          break;
        }
        if (role && role !== "assistant") {
          log.debug("translate.skip_non_assistant_message_start", { role });
          break;
        }
        this.currentMessageId = this.nextMessageId();
        break;
      }

      case "message_end": {
        const role = event.message?.role;
        if (role === "toolResult") {
          const toolCallId = event.message?.toolCallId;
          if (toolCallId && !this.emittedToolResults.has(toolCallId)) {
            const buffered = this.toolResultBuffer.get(toolCallId);
            const content =
              buffered?.content ??
              this.extractToolResult(event.message?.content, "");
            this.toolResultBuffer.delete(toolCallId);
            this.emittedToolResults.add(toolCallId);
            out.push({
              type: EventType.TOOL_CALL_RESULT,
              messageId: this.nextToolMessageId(),
              toolCallId,
              role: "tool",
              content,
              timestamp: this.now(),
            } as BaseEvent);
          }
          break;
        }
        if (this.currentMessageId) {
          this.currentMessageId = null;
          for (const toolCallId of this.openToolCallIds) {
            out.push({
              type: EventType.TOOL_CALL_END,
              toolCallId,
              timestamp: this.now(),
            } as BaseEvent);
          }
          this.openToolCallIds = [];
        }
        break;
      }

      case "message_update": {
        const ame = event.assistantMessageEvent;
        if (!ame) break;
        switch (ame.type) {
          case "text_delta": {
            if (!this.currentMessageId) {
              log.debug("translate.dropped", { reason: "text_delta before message_start" });
              break;
            }
            out.push({
              type: EventType.TEXT_MESSAGE_CHUNK,
              messageId: this.currentMessageId,
              role: "assistant",
              delta: ame.delta,
              timestamp: this.now(),
            } as BaseEvent);
            break;
          }
          case "thinking_delta": {
            if (!this.currentMessageId) {
              log.debug("translate.dropped", { reason: "thinking_delta before message_start" });
              break;
            }
            out.push({
              type: EventType.REASONING_MESSAGE_CHUNK,
              messageId: `${this.currentMessageId}-reason`,
              delta: ame.delta,
              timestamp: this.now(),
            } as BaseEvent);
            break;
          }
          case "toolcall_start": {
            const partial = ame.partial;
            const block =
              ame.contentIndex !== undefined &&
              partial &&
              Array.isArray(partial.content)
                ? partial.content[ame.contentIndex]
                : undefined;
            const toolCall = isToolCall(block)
              ? block
              : isToolCall(ame.toolCall)
                ? ame.toolCall
                : undefined;
            const toolCallId = toolCall?.id ?? this.nextMessageId();
            const toolCallName = toolCall?.name ?? "unknown";
            this.openToolCallIds.push(toolCallId);
            out.push({
              type: EventType.TOOL_CALL_START,
              toolCallId,
              toolCallName,
              parentMessageId: this.currentMessageId ?? undefined,
              timestamp: this.now(),
            } as BaseEvent);
            break;
          }
          case "toolcall_delta": {
            const last = this.openToolCallIds[this.openToolCallIds.length - 1];
            if (!last) {
              log.debug("translate.dropped", {
                reason: "toolcall_delta before toolcall_start",
              });
              break;
            }
            out.push({
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: last,
              delta: ame.delta,
              timestamp: this.now(),
            } as BaseEvent);
            break;
          }
          case "toolcall_end": {
            const last = this.openToolCallIds.pop();
            if (last) {
              out.push({
                type: EventType.TOOL_CALL_END,
                toolCallId: last,
                timestamp: this.now(),
              } as BaseEvent);
            }
            break;
          }
          case "text_start":
          case "text_end":
          case "thinking_start":
          case "thinking_end":
          case "start":
          case "done":
          case "error":
            break;
          default:
            break;
        }
        break;
      }

      case "tool_execution_start": {
        const toolCallId = event.toolCallId;
        const stepName = `tool:${event.toolName}:${toolCallId ?? this.nextMessageId()}`;
        if (toolCallId) {
          this.stepNames.set(toolCallId, stepName);
        }
        out.push({
          type: EventType.STEP_STARTED,
          stepName,
          rawEvent: { toolCallId },
          timestamp: this.now(),
        } as BaseEvent);
        break;
      }

      case "tool_execution_update":
        break;

      case "tool_execution_end": {
        const toolCallId = event.toolCallId;
        const finalId = toolCallId ?? this.nextMessageId();

        if (!this.emittedToolResults.has(finalId)) {
          const buffered = this.toolResultBuffer.get(finalId);
          const content =
            buffered?.content ??
            (typeof event.result === "string"
              ? event.result
              : JSON.stringify(event.result ?? ""));
          this.toolResultBuffer.delete(finalId);
          this.emittedToolResults.add(finalId);
          out.push({
            type: EventType.TOOL_CALL_RESULT,
            messageId: this.nextToolMessageId(),
            toolCallId: finalId,
            role: "tool",
            content,
            timestamp: this.now(),
          } as BaseEvent);
        } else {
          log.debug("translate.tool_result_already_emitted", { toolCallId: finalId });
        }

        const stepName = toolCallId
          ? this.stepNames.get(toolCallId)
          : undefined;
        if (toolCallId) {
          this.stepNames.delete(toolCallId);
        }
        if (stepName) {
          out.push({
            type: EventType.STEP_FINISHED,
            stepName,
            rawEvent: { toolCallId: finalId, isError: !!event.isError },
            timestamp: this.now(),
          } as BaseEvent);
        } else {
          log.debug("translate.step_finish_skipped", { toolCallId: finalId });
        }
        break;
      }

      case "turn_start":
        break;

      case "turn_end":
        break;

      case "error":
        out.push({
          type: EventType.RUN_ERROR,
          threadId,
          runId,
          message: event.message,
          timestamp: this.now(),
        } as BaseEvent);
        break;

      default:
        log.debug("translate.unknown_type", { piType: eventType });
    }

    log.debug("translate", {
      piType: event.type,
      aguiTypes: out.map((e) => e.type),
    });
    return out;
  }
}
