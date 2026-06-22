import { EventType, type BaseEvent } from "@ag-ui/client";
import { getTraceLogger } from "tracing";
import type {
  CodingAgentEvent,
  ContentBlock,
  RelaxedToolCall,
} from "coding-agent";

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

/**
 * Near-stateless translator from Pi SDK events to AG-UI events.
 *
 * The translator emits the AG-UI tool-call triad explicitly
 * (`TOOL_CALL_START` → `TOOL_CALL_ARGS` → `TOOL_CALL_END`) plus
 * `TOOL_CALL_RESULT` so client state machines never get stuck in
 * "loading". Text and reasoning still go through the AG-UI client's
 * "convenience chunk" events (`TEXT_MESSAGE_CHUNK`,
 * `REASONING_MESSAGE_CHUNK`) since the AG-UI client auto-expands them
 * into the full START / CONTENT / END sequence.
 *
 * State held between calls (intentionally minimal):
 *
 *   1. `currentMessageId` — bound to Pi's `message_start`, cleared on
 *      `message_end`, gives text/reasoning a stable id for the duration
 *      of the assistant message.
 *
 *   2. `activeToolCalls` — Map keyed by the `contentIndex` that the Pi
 *      SDK attaches to every `toolcall_start`/`delta`/`end` event. The
 *      SDK emits assistant-message events as an interleaved stream, so
 *      multiple tool calls can be in flight at once; keying on
 *      `contentIndex` keeps each call's `id`/`name` bound to its own
 *      JSON-args stream and prevents cross-talk between parallel tools.
 *      Entries are inserted on `toolcall_start`, read on `toolcall_delta`,
 *      and removed on `toolcall_end`. Any entries still present on
 *      `message_end` are closed explicitly (Pi sometimes omits
 *      `toolcall_end`).
 *
 *   3. `toolResultBuffer` / `emittedToolResults` — coalesce the two
 *      sources Pi can deliver a tool result from: a `toolResult`
 *      message (`message_start`/`message_end`) and `tool_execution_end`.
 *      Whichever arrives first emits `TOOL_CALL_RESULT`; the other is a
 *      no-op.
 *
 *   4. `stepNames` — remember the `stepName` used on `STEP_STARTED` so
 *      the matching `STEP_FINISHED` can reuse it (the AG-UI client pairs
 *      them by name).
 */
export class PiToAguiTranslator {
  private currentMessageId: string | null = null;
  private activeToolCalls = new Map<number, ActiveToolCall>();
  private toolResultBuffer = new Map<string, BufferedToolResult>();
  private emittedToolResults = new Set<string>();
  private stepNames = new Map<string, string>();
  private messageCounter = 0;
  private toolIdMap = new Map<string, string>();
  private unmappedToolCalls: Array<{ generatedId: string; name: string }> = [];

  constructor(private readonly context: TranslatorContext) {}

  hydrateState(state: {
    currentMessageId?: string | null;
    activeToolCalls?: ReadonlyMap<number, ActiveToolCall>;
    messageCounter?: number;
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
    if (
      state.messageCounter !== undefined &&
      state.messageCounter > this.messageCounter
    ) {
      this.messageCounter = state.messageCounter;
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
        this.currentMessageId = this.nextMessageId();
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
              messageId: `${this.currentMessageId}-reason`,
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
            const toolCallId = toolCall?.id ?? this.nextMessageId();
            const toolCallName = toolCall?.name ?? "unknown";

            // During reconnect we hydrate activeToolCalls and emit the
            // in-flight tool calls manually so the UI shows them immediately.
            // When the live stream catches up it will send toolcall_start for
            // the same call; suppress the duplicate AG-UI event.
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

        const finalId = toolCallId ?? this.nextMessageId();
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
    return out;
  }
}
