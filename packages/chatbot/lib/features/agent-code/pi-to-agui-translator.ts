import { EventType, type BaseEvent } from "@ag-ui/client";
import { getTraceLogger } from "tracing";

type AssistantEvent =
  | { type: "start"; partial?: unknown }
  | { type: "text_start"; contentIndex: number; partial?: unknown }
  | { type: "text_delta"; contentIndex: number; delta: string; partial?: unknown }
  | { type: "text_end"; contentIndex: number; content: string; partial?: unknown }
  | {
      type: "thinking_start";
      contentIndex: number;
      partial?: unknown;
    }
  | {
      type: "thinking_delta";
      contentIndex: number;
      delta: string;
      partial?: unknown;
    }
  | {
      type: "thinking_end";
      contentIndex: number;
      content: string;
      partial?: unknown;
    }
  | { type: "toolcall_start"; contentIndex: number; toolCall?: { id: string; name: string }; partial?: unknown }
  | { type: "toolcall_delta"; contentIndex: number; delta: string }
  | { type: "toolcall_end"; contentIndex: number; toolCall?: { id: string; name: string }; partial?: unknown }
  | { type: "done"; message?: unknown }
  | { type: "error"; error?: unknown };

type PiEvent =
  | { type: "agent_start" }
  | { type: "agent_end" }
  | { type: "turn_start" }
  | { type: "turn_end" }
  | {
      type: "message_start";
      message?: {
        id?: string;
        role?: string;
        toolCallId?: string;
        content?: unknown;
      };
    }
  | {
      type: "message_end";
      message?: { id?: string; role?: string; toolCallId?: string };
    }
  | {
      type: "message_update";
      assistantMessageEvent: AssistantEvent;
    }
  | { type: "tool_execution_start"; toolCallId?: string; toolName: string }
  | { type: "tool_execution_update"; toolCallId?: string }
  | {
      type: "tool_execution_end";
      toolCallId?: string;
      toolName: string;
      result: unknown;
      isError: boolean;
    }
  | { type: "error"; message: string };

export interface TranslatorContext {
  threadId: string;
  runId: string;
}

/**
 * Stateful translator from Pi SDK events to AG-UI events.
 *
 * One instance per run. Tracks the current assistant `messageId` and any open
 * reasoning/tool-call IDs so a stream of `message_update` sub-events can be
 * expanded into the matching AG-UI START / CONTENT / END triplets.
 */
export class PiToAguiTranslator {
  private currentMessageId: string | null = null;
  private currentReasoningId: string | null = null;
  private textStarted = false;
  private openToolCallIds = new Set<string>();
  private emittedToolCallIds = new Set<string>();
  private toolResultBuffer = new Map<string, { content: string; timestamp: number }>();
  private counter = 0;

  constructor(private readonly context: TranslatorContext) {}

  private id(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  private now(): number {
    return Date.now();
  }

  private flushExpiredToolResults(out: BaseEvent[]): void {
    const now = this.now();
    for (const [toolCallId, entry] of this.toolResultBuffer.entries()) {
      if (now - entry.timestamp > 30000) {
        this.toolResultBuffer.delete(toolCallId);
        this.emittedToolCallIds.add(toolCallId);
        out.push({
          type: EventType.TOOL_CALL_RESULT,
          messageId: this.id("tool-msg"),
          toolCallId,
          role: "tool",
          content: entry.content,
          timestamp: now,
        } as BaseEvent);
      }
    }
  }

  private flushAllToolResults(out: BaseEvent[]): void {
    const now = this.now();
    for (const [toolCallId, entry] of this.toolResultBuffer.entries()) {
      this.toolResultBuffer.delete(toolCallId);
      this.emittedToolCallIds.add(toolCallId);
      out.push({
        type: EventType.TOOL_CALL_RESULT,
        messageId: this.id("tool-msg"),
        toolCallId,
        role: "tool",
        content: entry.content,
        timestamp: now,
      } as BaseEvent);
    }
  }

  translate(event: PiEvent): BaseEvent[] {
    const log = getTraceLogger("bridge");
    const { threadId, runId } = this.context;
    const out: BaseEvent[] = [];

    this.flushExpiredToolResults(out);

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
        this.flushAllToolResults(out);
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
          const toolCallId = event.message?.toolCallId ?? this.id("tc");
          const raw = event.message?.content;
          const content = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
          if (!this.emittedToolCallIds.has(toolCallId)) {
            this.toolResultBuffer.set(toolCallId, { content, timestamp: this.now() });
          }
          break;
        }
        if (role && role !== "assistant") {
          log.debug("translate.skip_non_assistant_message_start", { role });
          break;
        }
        this.currentMessageId = this.id("msg");
        this.textStarted = false;
        break;
      }

      case "message_end": {
        const role = event.message?.role;
        if (role === "toolResult") {
          const toolCallId = event.message?.toolCallId;
          if (toolCallId && this.toolResultBuffer.has(toolCallId)) {
            const entry = this.toolResultBuffer.get(toolCallId)!;
            this.toolResultBuffer.delete(toolCallId);
            this.emittedToolCallIds.add(toolCallId);
            out.push({
              type: EventType.TOOL_CALL_RESULT,
              messageId: this.id("tool-msg"),
              toolCallId,
              role: "tool",
              content: entry.content,
              timestamp: this.now(),
            } as BaseEvent);
          }
          break;
        }

        if (this.currentMessageId) {
          if (this.currentReasoningId) {
            out.push({
              type: EventType.REASONING_MESSAGE_END,
              messageId: this.currentReasoningId,
              timestamp: this.now(),
            } as BaseEvent);
            out.push({
              type: EventType.REASONING_END,
              messageId: this.currentReasoningId,
              timestamp: this.now(),
            } as BaseEvent);
            this.currentReasoningId = null;
          }
          for (const toolCallId of this.openToolCallIds) {
            out.push({
              type: EventType.TOOL_CALL_END,
              toolCallId,
              timestamp: this.now(),
            } as BaseEvent);
          }
          this.openToolCallIds.clear();
          if (this.textStarted) {
            out.push({
              type: EventType.TEXT_MESSAGE_END,
              messageId: this.currentMessageId,
              timestamp: this.now(),
            } as BaseEvent);
          }
          this.currentMessageId = null;
          this.textStarted = false;
        }
        break;
      }

      case "message_update": {
        const ame = event.assistantMessageEvent;
        switch (ame.type) {
          case "text_start": {
            if (this.currentReasoningId) {
              out.push({
                type: EventType.REASONING_MESSAGE_END,
                messageId: this.currentReasoningId,
                timestamp: this.now(),
              } as BaseEvent);
              out.push({
                type: EventType.REASONING_END,
                messageId: this.currentReasoningId,
                timestamp: this.now(),
              } as BaseEvent);
              this.currentReasoningId = null;
            }
            if (this.currentMessageId && !this.textStarted) {
              out.push({
                type: EventType.TEXT_MESSAGE_START,
                messageId: this.currentMessageId,
                role: "assistant",
                timestamp: this.now(),
              } as BaseEvent);
              this.textStarted = true;
            }
            break;
          }
          case "text_delta": {
            if (!this.currentMessageId) {
              log.debug("translate.dropped", { reason: "text_delta before message_start" });
              break;
            }
            out.push({
              type: EventType.TEXT_MESSAGE_CONTENT,
              messageId: this.currentMessageId,
              delta: ame.delta,
              timestamp: this.now(),
            } as BaseEvent);
            break;
          }
          case "text_end":
            break;
          case "thinking_start": {
            if (!this.currentReasoningId) {
              this.currentReasoningId = this.id("reason");
              out.push({
                type: EventType.REASONING_START,
                messageId: this.currentReasoningId,
                timestamp: this.now(),
              } as BaseEvent);
              out.push({
                type: EventType.REASONING_MESSAGE_START,
                messageId: this.currentReasoningId,
                role: "reasoning",
                timestamp: this.now(),
              } as BaseEvent);
            }
            break;
          }
          case "thinking_delta": {
            if (!this.currentReasoningId) {
              this.currentReasoningId = this.id("reason");
              out.push({
                type: EventType.REASONING_START,
                messageId: this.currentReasoningId,
                timestamp: this.now(),
              } as BaseEvent);
              out.push({
                type: EventType.REASONING_MESSAGE_START,
                messageId: this.currentReasoningId,
                role: "reasoning",
                timestamp: this.now(),
              } as BaseEvent);
            }
            out.push({
              type: EventType.REASONING_MESSAGE_CONTENT,
              messageId: this.currentReasoningId,
              delta: ame.delta,
              timestamp: this.now(),
            } as BaseEvent);
            break;
          }
          case "thinking_end":
            break;
          case "toolcall_start": {
            /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
            const eventAny = ame as any;
            const partial = eventAny.partial;
            const toolCall = partial?.content?.[ame.contentIndex];
            const toolCallId = toolCall?.id ?? eventAny.toolCall?.id ?? this.id("tc");
            const toolCallName = toolCall?.name ?? eventAny.toolCall?.name ?? "unknown";
            this.openToolCallIds.add(toolCallId);
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
            // Find the most recent open tool call (Pi keeps one in flight per call).
            const last = [...this.openToolCallIds].at(-1);
            if (last) {
              out.push({
                type: EventType.TOOL_CALL_ARGS,
                toolCallId: last,
                delta: ame.delta,
                timestamp: this.now(),
              } as BaseEvent);
            }
            break;
          }
          case "toolcall_end": {
            // TOOL_CALL_END is emitted on message_end to keep the lifecycle
            // symmetric with the rest of the protocol; nothing to do here.
            break;
          }
          case "done":
          case "error":
          case "start":
            break;
        }
        break;
      }

      case "tool_execution_start":
      case "tool_execution_update":
        break;

      case "tool_execution_end": {
        const toolCallId = event.toolCallId;
        const finalId = toolCallId ?? this.id("tc");

        if (this.emittedToolCallIds.has(finalId)) {
          log.debug("translate.tool_result_dedup", { toolCallId: finalId });
          break;
        }
        if (!this.currentMessageId && !toolCallId) {
          log.debug("translate.tool_result_orphan", { toolCallId });
        }

        let content = "";
        const entry = this.toolResultBuffer.get(finalId);
        if (entry) {
          this.toolResultBuffer.delete(finalId);
          content = entry.content;
        } else {
          content = typeof event.result === "string"
            ? event.result
            : JSON.stringify(event.result ?? "");
        }

        this.emittedToolCallIds.add(finalId);
        out.push({
          type: EventType.TOOL_CALL_RESULT,
          messageId: this.currentMessageId ?? this.id("tool-msg"),
          toolCallId: finalId,
          role: "tool",
          content,
          timestamp: this.now(),
        } as BaseEvent);
        break;
      }

      case "turn_start":
        break;

      case "turn_end":
        this.flushAllToolResults(out);
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
        log.debug("translate.unknown_type", {
          piType: (event as { type: string }).type,
        });
    }

    log.debug("translate", {
      piType: event.type,
      aguiTypes: out.map((e) => e.type),
    });
    return out;
  }
}
