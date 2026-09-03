import { getTraceLogger } from "tracing";
import type { CodingAgentEvent, ContentBlock, RelaxedToolCall } from "../index";
import {
  assistantMessageId,
  reasoningMessageId,
  toolResultMessageId,
  IdDeduper,
} from "./message-ids";
import { AguiEventType, AUTO_RETRY_EVENT, QUEUE_UPDATE_EVENT, type AguiEvent } from "./agui-event";
export { AguiEventType, AUTO_RETRY_EVENT, QUEUE_UPDATE_EVENT };
export type { AguiEvent };
import { stringArrayOf } from "../session/pending-queues";
// Deprecated alias kept for transitional tests — will be removed
export type BaseEvent = AguiEvent;

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
  /** Whether this translator already emitted the run's RUN_STARTED. */
  private runStarted = false;

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

  translate(event: CodingAgentEvent): AguiEvent[] {
    const log = getTraceLogger("worker");
    const { threadId, runId } = this.context;
    const out: AguiEvent[] = [];
    const eventType = event.type;
    this.incrementCount(this.inputEventCounts, eventType);

    switch (event.type) {
      case "agent_start":
        // Pi opens a new agent cycle per auto-retry attempt; the AG-UI run
        // is still active, so a second RUN_STARTED would violate the run
        // state machine ("Cannot send 'RUN_STARTED' while a run is still
        // active"). Only the first agent_start of a turn opens the run.
        if (this.runStarted) {
          log.debug("translate.skip_duplicate_run_started");
          break;
        }
        this.runStarted = true;
        out.push({
          type: EventType.RUN_STARTED,
          threadId,
          runId,
          timestamp: this.now(),
        });
        break;

      case "agent_end": {
        for (const [toolCallId, stepName] of this.stepNames.entries()) {
          out.push({
            type: EventType.STEP_FINISHED,
            stepName,
            rawEvent: { toolCallId, isError: true },
            timestamp: this.now(),
          });
        }
        this.stepNames.clear();

        // Pi closes and reopens the agent cycle around every auto-retry
        // (agent_end willRetry:true → auto_retry_start → agent_start).
        // A terminal here would end the AG-UI run mid-turn and, combined
        // with the retry's events, poison the event log for reconnects
        // ("The run has already finished with 'RUN_FINISHED'"). The
        // terminal is only emitted for the definitive end of the turn.
        if (event.willRetry) {
          log.debug("translate.agent_end_will_retry", { willRetry: true });
          break;
        }
        const messages = (event.messages ?? []) as Array<{
          role?: string;
          stopReason?: string;
          errorMessage?: string;
        }>;
        const lastAssistant = [...messages]
          .reverse()
          .find((message) => message?.role === "assistant");
        const failed =
          lastAssistant !== undefined &&
          (lastAssistant.stopReason === "error" ||
            lastAssistant.stopReason === "aborted" ||
            typeof lastAssistant.errorMessage === "string");
        if (failed) {
          out.push({
            type: EventType.RUN_ERROR,
            threadId,
            runId,
            message:
              lastAssistant.errorMessage ??
              `Assistant finished with ${lastAssistant.stopReason}`,
            timestamp: this.now(),
          });
        } else {
          out.push({
            type: EventType.RUN_FINISHED,
            threadId,
            runId,
            timestamp: this.now(),
          });
        }
        this.runStarted = false;
        break;
      }

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
            });
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
            });
          }
          this.activeToolCalls.clear();
        }

        // Note: an assistant message_end with stopReason "error"/"aborted" is
        // deliberately NOT translated to a terminal RUN_ERROR here. Pi emits
        // it per failed attempt and may auto-retry (agent_end willRetry:true
        // → agent_start); the run-level terminal is owned by agent_end (see
        // above) and the prompt-promise fallback in turn-runner.
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
              delta: ame.delta as string,
              timestamp: this.now(),
            });
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
              delta: ame.delta as string,
              timestamp: this.now(),
            });
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
            const toolCall = isToolCall(block as ContentBlock | undefined)
              ? (block as RelaxedToolCall)
              : isToolCall(ame.toolCall as ContentBlock | undefined)
                ? (ame.toolCall as RelaxedToolCall)
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
            });
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
              delta: ame.delta as string,
              timestamp: this.now(),
            });
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
            });
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
        });
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
          });
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
          });
        } else {
          log.warn("translate.step_finish_skipped", { toolCallId: finalId });
        }
        break;
      }

      case "turn_start":
        break;

      case "turn_end":
        break;

      case "auto_retry_start":
        // Non-terminal visibility for the retry: the AG-UI run stays open,
        // but UIs and replays can surface "retrying…" from this CUSTOM.
        out.push({
          type: EventType.CUSTOM,
          name: AUTO_RETRY_EVENT,
          value: {
            attempt: event.attempt,
            maxAttempts: event.maxAttempts,
            delayMs: event.delayMs,
            errorMessage: event.errorMessage,
          },
          timestamp: this.now(),
        });
        break;

      case "queue_update": {
        // Source of truth for the pending-message chip: the worker owns both
        // queues, so every change (enqueue, delivery, clear) is re-emitted
        // here and the UI never tracks queue state locally.
        const steering = stringArrayOf(event.steering);
        const followUp = stringArrayOf(event.followUp);
        out.push({
          type: EventType.CUSTOM,
          name: QUEUE_UPDATE_EVENT,
          value: { steering, followUp },
          timestamp: this.now(),
        });
        break;
      }

      case "error":
        for (const [toolCallId, stepName] of this.stepNames.entries()) {
          out.push({
            type: EventType.STEP_FINISHED,
            stepName,
            rawEvent: { toolCallId, isError: true },
            timestamp: this.now(),
          });
        }
        this.stepNames.clear();

        out.push({
          type: EventType.RUN_ERROR,
          threadId,
          runId,
          message: event.message,
          timestamp: this.now(),
        });
        this.runStarted = false;
        break;

      default:
        log.debug("translate.unknown_type", { piType: (event as { type: string }).type });
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

  /**
   * Incremental triplet for a queued user message delivered mid-turn.
   *
   * The run stays open (same runId): START/CONTENT/END appends the message
   * to the live transcript without clobbering the assistant deltas already
   * applied by the client — which a MESSAGES_SNAPSHOT replacement would
   * wipe. The id must match `convertPiMessagesToAgui` for the same Pi
   * message (`u-<timestamp>`) so reconnect snapshots dedupe by id instead
   * of showing the message twice.
   */
  userMessageEvents(messageId: string, text: string): AguiEvent[] {
    const timestamp = this.now();
    const out: AguiEvent[] = [
      { type: EventType.TEXT_MESSAGE_START, messageId, role: "user", timestamp },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: text, timestamp },
      { type: EventType.TEXT_MESSAGE_END, messageId, timestamp },
    ];
    for (const aguiEvent of out) {
      this.incrementCount(this.outputEventCounts, aguiEvent.type);
    }
    return out;
  }
}
