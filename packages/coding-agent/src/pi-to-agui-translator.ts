import { getTraceLogger } from "tracing";
import type {
  CodingAgentEvent,
  ContentBlock,
  RelaxedToolCall,
} from "./index";
import {
  assistantMessageId,
  reasoningMessageId,
  toolResultMessageId,
  IdDeduper,
} from "./message-ids";

export type BaseEvent = { type: string; [key: string]: unknown };

export const AguiEventType = {
  RUN_STARTED: "RUN_STARTED",
  RUN_FINISHED: "RUN_FINISHED",
  RUN_ERROR: "RUN_ERROR",
  MESSAGES_SNAPSHOT: "MESSAGES_SNAPSHOT",
  TEXT_MESSAGE_CHUNK: "TEXT_MESSAGE_CHUNK",
  REASONING_MESSAGE_CHUNK: "REASONING_MESSAGE_CHUNK",
  TOOL_CALL_START: "TOOL_CALL_START",
  TOOL_CALL_ARGS: "TOOL_CALL_ARGS",
  TOOL_CALL_END: "TOOL_CALL_END",
  TOOL_CALL_RESULT: "TOOL_CALL_RESULT",
  STEP_STARTED: "STEP_STARTED",
  STEP_FINISHED: "STEP_FINISHED",
} as const;

const EventType = AguiEventType;

function isToolCall(block: ContentBlock | undefined): block is RelaxedToolCall {
  return block !== undefined && (block.type === "toolCall" || "id" in block || "name" in block);
}

export interface TranslatorContext {
  threadId: string;
  runId: string;
}

interface BufferedToolResult {
  content: string;
}

export interface ActiveToolCall {
  id: string;
  name: string;
}

export interface TranslatorDiagnostics {
  inputEventCounts: Record<string, number>;
  outputEventCounts: Record<string, number>;
  currentMessageId: string | null;
  activeToolCallCount: number;
  bufferedToolResultCount: number;
  emittedToolResultCount: number;
  activeStepCount: number;
  unmappedToolCallCount: number;
}

/**
 * Near-stateless translator from Pi SDK events to AG-UI events.
 *
 * The worker owns this translation so reconnects replay already-normalized
 * events instead of rebuilding tool-call state inside a short-lived BFF
 * request.
 */
export class PiToAguiTranslator {
  private currentMessageId: string | null = null;
  private activeToolCalls = new Map<number, ActiveToolCall>();
  private toolResultBuffer = new Map<string, BufferedToolResult>();
  private emittedToolResults = new Set<string>();
  private stepNames = new Map<string, string>();
  private messageIdDeduper = new IdDeduper();
  private toolIdMap = new Map<string, string>();
  private unmappedToolCalls: Array<{ generatedId: string; name: string }> = [];
  private inputEventCounts = new Map<string, number>();
  private outputEventCounts = new Map<string, number>();

  constructor(private readonly context: TranslatorContext) {}

  hydrateState(state: {
    currentMessageId?: string | null;
    activeToolCalls?: ReadonlyMap<number, ActiveToolCall>;
    emittedToolResultIds?: ReadonlySet<string>;
    stepNames?: ReadonlyMap<string, string>;
    unmappedToolCalls?: Array<{ generatedId: string; name: string }>;
  }): void {
    if (state.currentMessageId) {
      this.currentMessageId = state.currentMessageId;
    }
    if (state.activeToolCalls && state.activeToolCalls.size > 0) {
      for (const [idx, tool] of state.activeToolCalls) {
        this.activeToolCalls.set(idx, { ...tool });
      }
    }
    if (state.emittedToolResultIds) {
      for (const id of state.emittedToolResultIds) {
        this.emittedToolResults.add(id);
        this.toolResultBuffer.delete(id);
      }
    }
    if (state.stepNames) {
      for (const [id, name] of state.stepNames) {
        this.stepNames.set(id, name);
      }
    }
    if (state.unmappedToolCalls) {
      this.unmappedToolCalls = [...state.unmappedToolCalls];
    }
  }

  private now(): number {
    return Date.now();
  }

  private incrementCount(counts: Map<string, number>, key: string): void {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  getDiagnostics(): TranslatorDiagnostics {
    return {
      inputEventCounts: Object.fromEntries(this.inputEventCounts),
      outputEventCounts: Object.fromEntries(this.outputEventCounts),
      currentMessageId: this.currentMessageId,
      activeToolCallCount: this.activeToolCalls.size,
      bufferedToolResultCount: this.toolResultBuffer.size,
      emittedToolResultCount: this.emittedToolResults.size,
      activeStepCount: this.stepNames.size,
      unmappedToolCallCount: this.unmappedToolCalls.length,
    };
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
    const log = getTraceLogger("worker");
    const { threadId, runId } = this.context;
    const out: BaseEvent[] = [];
    const eventType = event.type;
    this.incrementCount(this.inputEventCounts, eventType);

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
        for (const [toolCallId, stepName] of this.stepNames.entries()) {
          out.push({
            type: EventType.STEP_FINISHED,
            stepName,
            rawEvent: { toolCallId, isError: true },
            timestamp: this.now(),
          } as BaseEvent);
        }
        this.stepNames.clear();

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
          let toolCallId = event.message?.toolCallId;
          if (toolCallId && this.toolIdMap.has(toolCallId)) {
            toolCallId = this.toolIdMap.get(toolCallId)!;
          }
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
        const timestamp = event.message?.timestamp;
        const baseId =
          typeof timestamp === "number"
            ? assistantMessageId(timestamp)
            : crypto.randomUUID();
        this.currentMessageId = this.messageIdDeduper.dedupe(baseId);
        break;
      }

      case "message_end": {
        const role = event.message?.role;
        if (role === "toolResult") {
          let toolCallId = event.message?.toolCallId;
          if (toolCallId && this.toolIdMap.has(toolCallId)) {
            toolCallId = this.toolIdMap.get(toolCallId)!;
          }
          if (toolCallId && !this.emittedToolResults.has(toolCallId)) {
            const buffered = this.toolResultBuffer.get(toolCallId);
            const content =
              buffered?.content ??
              this.extractToolResult(event.message?.content, "");
            this.toolResultBuffer.delete(toolCallId);
            this.emittedToolResults.add(toolCallId);
            out.push({
              type: EventType.TOOL_CALL_RESULT,
              messageId: toolResultMessageId(toolCallId),
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
          for (const { id: toolCallId } of this.activeToolCalls.values()) {
            out.push({
              type: EventType.TOOL_CALL_END,
              toolCallId,
              timestamp: this.now(),
            } as BaseEvent);
          }
          this.activeToolCalls.clear();
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
              messageId: reasoningMessageId(this.currentMessageId),
              delta: ame.delta,
              timestamp: this.now(),
            } as BaseEvent);
            break;
          }
          case "toolcall_start": {
            const contentIndex = ame.contentIndex;
            if (typeof contentIndex !== "number") {
              log.debug("translate.dropped", {
                reason: "toolcall_start missing contentIndex",
              });
              break;
            }
            const existing = this.activeToolCalls.get(contentIndex);
            const partial = ame.partial;
            const block =
              partial && Array.isArray(partial.content)
                ? partial.content[contentIndex]
                : undefined;
            const toolCall = isToolCall(block)
              ? block
              : isToolCall(ame.toolCall)
                ? ame.toolCall
                : undefined;
            const toolCallId = toolCall?.id ?? crypto.randomUUID();
            const toolCallName = toolCall?.name ?? "unknown";

            if (
              existing &&
              existing.id === toolCallId &&
              existing.name === toolCallName
            ) {
              log.info("translate.suppressed_duplicate_toolcall_start", {
                contentIndex,
                toolCallId,
              });
              break;
            }

            this.activeToolCalls.set(contentIndex, {
              id: toolCallId,
              name: toolCallName,
            });

            if (!toolCall?.id) {
              this.unmappedToolCalls.push({
                generatedId: toolCallId,
                name: toolCallName,
              });
            }

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
            const contentIndex = ame.contentIndex;
            if (typeof contentIndex !== "number") {
              log.debug("translate.dropped", {
                reason: "toolcall_delta missing contentIndex",
              });
              break;
            }
            const active = this.activeToolCalls.get(contentIndex);
            if (!active) {
              log.warn("translate.dropped", {
                reason: "toolcall_delta before toolcall_start",
                contentIndex,
              });
              break;
            }
            out.push({
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: active.id,
              delta: ame.delta,
              timestamp: this.now(),
            } as BaseEvent);
            break;
          }
          case "toolcall_end": {
            const contentIndex = ame.contentIndex;
            if (typeof contentIndex !== "number") {
              log.debug("translate.dropped", {
                reason: "toolcall_end missing contentIndex",
              });
              break;
            }
            const active = this.activeToolCalls.get(contentIndex);
            if (!active) {
              log.warn("translate.dropped", {
                reason: "toolcall_end without matching toolcall_start",
                contentIndex,
              });
              break;
            }
            this.activeToolCalls.delete(contentIndex);
            out.push({
              type: EventType.TOOL_CALL_END,
              toolCallId: active.id,
              timestamp: this.now(),
            } as BaseEvent);
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
        let toolCallId = event.toolCallId;
        if (toolCallId) {
          const idx = this.unmappedToolCalls.findIndex(
            (t) => t.name === event.toolName,
          );
          if (idx !== -1) {
            const mapped = this.unmappedToolCalls[idx];
            this.unmappedToolCalls.splice(idx, 1);
            this.toolIdMap.set(toolCallId, mapped.generatedId);
            log.info("translate.mapped_tool_id", {
              realId: toolCallId,
              generatedId: mapped.generatedId,
              toolName: event.toolName,
            });
            toolCallId = mapped.generatedId;
          }
        }

        const finalId = toolCallId ?? crypto.randomUUID();
        const stepName = `tool:${event.toolName}:${finalId}`;
        if (finalId) {
          this.stepNames.set(finalId, stepName);
        }
        out.push({
          type: EventType.STEP_STARTED,
          stepName,
          rawEvent: { toolCallId: finalId },
          timestamp: this.now(),
        } as BaseEvent);
        break;
      }

      case "tool_execution_update":
        break;

      case "tool_execution_end": {
        let toolCallId = event.toolCallId;
        if (toolCallId && this.toolIdMap.has(toolCallId)) {
          toolCallId = this.toolIdMap.get(toolCallId)!;
        }
        const finalId = toolCallId ?? crypto.randomUUID();

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
            messageId: toolResultMessageId(finalId),
            toolCallId: finalId,
            role: "tool",
            content,
            timestamp: this.now(),
          } as BaseEvent);
        } else {
          log.debug("translate.tool_result_already_emitted", { toolCallId: finalId });
        }

        const stepName = finalId ? this.stepNames.get(finalId) : undefined;
        if (finalId) {
          this.stepNames.delete(finalId);
        }
        if (stepName) {
          out.push({
            type: EventType.STEP_FINISHED,
            stepName,
            rawEvent: { toolCallId: finalId, isError: !!event.isError },
            timestamp: this.now(),
          } as BaseEvent);
        } else {
          log.warn("translate.step_finish_skipped", { toolCallId: finalId });
        }
        break;
      }

      case "turn_start":
        break;

      case "turn_end":
        break;

      case "error":
        for (const [toolCallId, stepName] of this.stepNames.entries()) {
          out.push({
            type: EventType.STEP_FINISHED,
            stepName,
            rawEvent: { toolCallId, isError: true },
            timestamp: this.now(),
          } as BaseEvent);
        }
        this.stepNames.clear();

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
    for (const aguiEvent of out) {
      this.incrementCount(this.outputEventCounts, aguiEvent.type);
    }
    return out;
  }
}
