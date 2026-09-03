import { readFileSync } from "node:fs";
import { stripFrontmatter } from "@earendil-works/pi-coding-agent";
import { getTraceLogger, retainTraceSink } from "tracing";
import type { ThinkingLevel } from "models";
import { type Cursor, type LoggedAguiEvent, type SessionEventLog } from "../agui/event-log";
import { PiToAguiTranslator } from "../agui/pi-to-agui-translator";
import { AguiEventType as EventType, FILES_CHANGED_EVENT, isSyncPoint, isTerminal, type AguiEvent } from "../agui/agui-event";
export { FILES_CHANGED_EVENT };
import { userMessageId } from "../agui/message-ids";
import {
  extractUserContentParts,
  inlineAttachedFiles,
} from "../runtime/attached-files";
import { captureGitFileState, diffTurnFiles, type GitFileState } from "./turn-git-state";
import type { CodingAgentEvent } from "../index";
import {
  type SessionEntry,
  appendAguiEvent,
  ensureEventLog,
  incrementCount,
  loggedLine,
  sessionCwd,
} from "./session-entry";
import { convertPiMessagesToAgui } from "../agui/agui-messages";
import { splitModelReference } from "../runtime/runtime-factory";
import type { SessionRegistry } from "./session-registry";

interface SnapshotMessage {
  id?: string;
  role: string;
  content?: unknown;
  toolCalls?: unknown;
  toolCallId?: string;
  name?: string;
}

function normalizeSnapshotMessages(messages: SnapshotMessage[] | undefined): SnapshotMessage[] {
  return (messages ?? [])
    .filter(
      (message): message is SnapshotMessage =>
        typeof message === "object" &&
        message !== null &&
        typeof message.role === "string",
    )
    .map((message, index) => ({
      id: typeof message.id === "string" ? message.id : `snapshot-${index}`,
      role: message.role,
      content: message.content ?? "",
      ...(Array.isArray(message.toolCalls) ? { toolCalls: message.toolCalls } : {}),
      ...(typeof message.toolCallId === "string" ? { toolCallId: message.toolCallId } : {}),
      ...(typeof message.name === "string" ? { name: message.name } : {}),
    }));
}

const LEADING_SKILL_COMMANDS =
  /^((?:\/skill:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:[ \t]+|(?=\r?\n|$)))+)([\s\S]*)$/;
const SKILL_NAME = /\/skill:([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)/g;

function expandLeadingSkillCommands(runtime: SessionEntry["runtime"], text: string): string {
  const match = text.match(LEADING_SKILL_COMMANDS);
  if (!match) return text;

  const availableSkills = runtime.session.resourceLoader.getSkills().skills;
  const names = Array.from(match[1]!.matchAll(SKILL_NAME), (command) => command[1]!);
  const blocks = names.map((name) => {
    const skill = availableSkills.find((candidate) => candidate.name === name);
    if (!skill) {
      throw new Error(`Unknown skill: ${name}`);
    }
    const content = readFileSync(skill.filePath, "utf8");
    const body = stripFrontmatter(content).trim();
    return `<skill name="${skill.name}" location="${skill.filePath}">
References are relative to ${skill.baseDir}.

${body}
</skill>`;
  });
  const userText = match[2]!.replace(/^\s+/, "");
  return userText ? `${blocks.join("\n\n")}\n\n${userText}` : blocks.join("\n\n");
}

function captureTurnBaseline(entry: SessionEntry): Promise<GitFileState | null> {
  const cwd = sessionCwd(entry);
  if (!cwd) return Promise.resolve(null);
  return captureGitFileState(cwd).catch(() => null);
}

export function applyThinkingLevel(
  session: { setThinkingLevel: (level: ThinkingLevel) => void },
  level: ThinkingLevel | undefined,
): void {
  if (!level) return;
  session.setThinkingLevel(level);
}

const LEADING_SKILL_COMMAND = /(^|\s)\/skill:[a-z0-9]/i;

/**
 * Fail-fast validation for v1 queue payloads: plain text only. Images,
 * docs, skills, prompts, comments and extension commands never reach the
 * queues — the composer disables those sources mid-turn (ticket 03), and
 * anything slipping through is rejected here instead of failing late
 * inside the agent loop.
 */
export function assertPlainQueueText(text: unknown): asserts text is string {
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new Error("Follow-up text must be a non-empty string");
  }
  const trimmed = text.trim();
  if (trimmed.startsWith("/")) {
    throw new Error("Commands cannot be queued as a follow-up (plain text only)");
  }
  if (LEADING_SKILL_COMMAND.test(trimmed)) {
    throw new Error("Skills cannot be queued as a follow-up (plain text only)");
  }
}

/** Plain-text extraction mirroring `convertPiMessagesToAgui` (user branch). */
function injectedUserText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c) => (c as { type?: string })?.type === "text")
      .map((c) => (c as { text?: string })?.text ?? "")
      .join("\n");
  }
  return "";
}

export class TurnRunner {
  constructor(private readonly registry: SessionRegistry) {}

  /**
   * Single streamer for both live prompts and reconnects: serializes the
   * initial records (prelude first, then replay events), subscribes for
   * live events, and applies the terminal-close policy exactly once.
   * `resolve` runs inside the stream's start so setup failures (access
   * guard, cursor epoch mismatch) surface as stream errors, not JSON-RPC
   * errors; returning null closes the stream quietly (session not found).
   */
  private createEventStream(
    label: string,
    summaryEventName: string,
    cursorSeq: number,
    resolve: () => {
      entry: SessionEntry;
      eventLog: SessionEventLog;
      prelude: LoggedAguiEvent[];
      events: LoggedAguiEvent[];
    } | null,
  ): ReadableStream<Uint8Array> {
    const log = getTraceLogger("worker");
    const encoder = new TextEncoder();
    let enqueuedLineCount = 0;
    let enqueueErrorCount = 0;
    const eventCounts: Record<string, number> = {};
    let cleanup: (() => void) | undefined;
    let closed = false;
    // Set by start(); the ReadableStream constructor runs start
    // synchronously, before cancel() can ever fire.
    let sessionId: string | undefined;
    let eventLog: SessionEventLog | undefined;

    const emitSummary = (reason: string) => {
      log.info(summaryEventName, {
        sessionId,
        reason,
        afterSeq: cursorSeq,
        enqueuedLineCount,
        enqueueErrorCount,
        eventCounts,
        eventLogLastSeq: eventLog?.lastSeq ?? 0,
      });
    };

    return new ReadableStream<Uint8Array>({
      start: (controller) => {
        let state: ReturnType<typeof resolve>;
        try {
          state = resolve();
        } catch (err) {
          // Setup failures (access guard, cursor epoch mismatch) surface
          // as stream errors: the RPC stays 200 and the error comes out
          // of the body, exactly as before the refactor.
          closed = true;
          log.error(`${label}.setup_error`, { error: String(err) });
          controller.error(err);
          return;
        }
        if (state === null) {
          closed = true;
          emitSummary("session_not_found");
          try {
            controller.close();
          } catch {
            // Client already gone.
          }
          return;
        }
        sessionId = state.entry.sessionId;
        eventLog = state.eventLog;
        const { entry, prelude, events } = state;

        const shouldCloseOnTerminal = (event: AguiEvent) => {
          if (!isTerminal(event)) return false;
          const eventRunId = (event as { runId?: string }).runId;
          return !entry.activeRun || eventRunId === entry.activeRun.runId;
        };

        const close = (reason: string) => {
          if (closed) return;
          closed = true;
          cleanup?.();
          try {
            controller.close();
          } catch {
            // The browser may already have closed the HTTP stream.
          }
          emitSummary(reason);
        };

        const emit = (logged: LoggedAguiEvent, closeTerminal: boolean) => {
          if (closed) return;
          incrementCount(eventCounts, logged.event.type);
          try {
            controller.enqueue(encoder.encode(loggedLine(logged)));
            enqueuedLineCount += 1;
          } catch (err) {
            enqueueErrorCount += 1;
            log.warn(`${label}.enqueue_error`, { sessionId, error: String(err) });
            close("enqueue_error");
            return;
          }
          if (closeTerminal && shouldCloseOnTerminal(logged.event)) {
            close("terminal");
          }
        };

        if (prelude.length > 0 || events.length > 0) {
          log.info(`${label}.replay`, {
            sessionId,
            afterSeq: cursorSeq,
            preludeCount: prelude.length,
            replayCount: events.length,
            eventLogLastSeq: eventLog.lastSeq,
            isStreaming: entry.runtime.session.isStreaming,
            hasActiveRun: !!entry.activeRun,
          });
        }
        for (const event of prelude) {
          emit(event, false);
        }
        for (let i = 0; i < events.length; i += 1) {
          emit(events[i]!, i === events.length - 1);
        }
        if (closed) return;

        cleanup = eventLog.subscribe((logged) => emit(logged, true));

        if (!entry.runtime.session.isStreaming && !entry.activeRun) {
          close("idle");
        }
      },
      cancel: () => {
        if (closed) return;
        closed = true;
        cleanup?.();
        log.info(`${label}.cancelled`, { sessionId });
        emitSummary("cancelled");
      },
    });
  }

  private startPromptCollector(
    entry: SessionEntry,
    prompt: string,
    runId: string,
    messages: SnapshotMessage[] | undefined,
    turnBaseline: GitFileState | null,
  ): void {
    const log = getTraceLogger("worker");
    const { sessionId, runtime } = entry;
    if (entry.activeRun || runtime.session.isStreaming) {
      log.warn("session.prompt_already_running", { sessionId });
      throw new Error("Session is already running");
    }

    const translator = new PiToAguiTranslator({ threadId: sessionId, runId });
    const preRunHistory = convertPiMessagesToAgui(runtime.session.messages);
    const clientMessages = normalizeSnapshotMessages(messages);
    const lastClientMessage = clientMessages[clientMessages.length - 1];
    const userTail =
      lastClientMessage && lastClientMessage.role === "user"
        ? [lastClientMessage]
        : [{ id: crypto.randomUUID(), role: "user", content: prompt }];
    const userMessageClientId = userTail[0].id as string;
    const snapshotMessages = [...preRunHistory, ...userTail];

    const extracted = extractUserContentParts(userTail[0]?.content ?? prompt);
    const inlinedText = inlineAttachedFiles(extracted.text, extracted.docs);
    const unexpandedPromptText =
      inlinedText.length > 0 ? inlinedText : extracted.images.length > 0 ? " " : prompt;
    const promptText = expandLeadingSkillCommands(runtime, unexpandedPromptText);
    const piImages = extracted.images.map((img) => ({
      type: "image" as const,
      data: img.data,
      mimeType: img.mimeType,
    }));

    log.info("session.prompt", {
      sessionId,
      runId,
      promptLength: promptText.length,
      imageCount: piImages.length,
      docCount: extracted.docs.length,
      historyMessageCount: messages?.length ?? 0,
    });
    const startSeq = ensureEventLog(entry).lastSeq + 1;
    const piEventCounts: Record<string, number> = {};
    const aguiEventCounts: Record<string, number> = {};
    let appendedAguiEventCount = 0;
    let snapshotAppended = false;
    let collectorClosed = false;
    let userMessageStamped = false;
    let terminalFlush: Promise<void> | undefined;
    let finalizeStarted = false;

    const finalizeTurn = (terminalEvent: AguiEvent): Promise<void> => {
      // Idempotent and serialized: only the first terminal of a turn may be
      // appended. Concurrent callers (e.g. a translator terminal racing the
      // prompt-promise fallback) await the same flush instead of appending a
      // second terminal — a double terminal in the event log poisons every
      // later reconnect ("The run has already finished with 'RUN_FINISHED'").
      if (finalizeStarted) return terminalFlush ?? Promise.resolve();
      finalizeStarted = true;
      const flush = (async () => {
        try {
          if (turnBaseline) {
            const cwd = sessionCwd(entry);
            const after = cwd ? await captureGitFileState(cwd) : null;
            const files = diffTurnFiles(turnBaseline, after);
            if (files.length > 0) {
              appendAguiEvent(
                entry,
                {
                  type: EventType.CUSTOM,
                  name: FILES_CHANGED_EVENT,
                  value: { runId, files },
                  timestamp: Date.now(),
                },
                aguiEventCounts,
              );
              appendedAguiEventCount += 1;
            }
          }
        } catch (err) {
          finalizeStarted = false;
          log.warn("session.turn_files_failed", { sessionId, runId, error: String(err) });
        }
        appendAguiEvent(entry, terminalEvent, aguiEventCounts);
        appendedAguiEventCount += 1;
      })();
      terminalFlush = flush;
      return flush;
    };

    const logCollectorSummary = (reason: string) => {
      if (collectorClosed) return;
      collectorClosed = true;
      log.info("session.prompt_collector_summary", {
        sessionId,
        runId,
        reason,
        piEventCounts,
        aguiEventCounts,
        appendedAguiEventCount,
        eventLogLastSeq: ensureEventLog(entry).lastSeq,
        translator: translator.getDiagnostics(),
      });
    };

    const unsubscribe = runtime.session.subscribe((rawEvent) => {
      const event = rawEvent as CodingAgentEvent;
      incrementCount(piEventCounts, event.type);
      if (event.type === "message_update") {
        const ame = event.assistantMessageEvent as { type?: string } | undefined;
        log.debug("pi.event", {
          type: event.type,
          deltaType: ame?.type,
        });
      } else {
        log.debug("pi.event", { type: event.type });
      }

      if (!userMessageStamped && event.type === "message_end" && event.message?.role === "user") {
        userMessageStamped = true;
        (event.message as Record<string, unknown>).clientMessageId = userMessageClientId;
        (event.message as Record<string, unknown>).clientPromptText = extracted.text;
      } else if (event.type === "message_end" && event.message?.role === "user") {
        // A queued message delivered mid-turn (followUp at end-of-turn,
        // steer before the next request). The run stays open under the same
        // runId: surface it incrementally so the transcript shows it inside
        // the active turn. Never a MESSAGES_SNAPSHOT here — replacing the
        // message list would wipe the assistant deltas the client already
        // applied from the stream.
        const injectedText = injectedUserText(event.message?.content);
        const timestamp = (event.message as { timestamp?: unknown }).timestamp;
        const messageId =
          typeof timestamp === "number" ? userMessageId(timestamp) : crypto.randomUUID();
        if (injectedText.length > 0) {
          for (const aguiEvent of translator.userMessageEvents(messageId, injectedText)) {
            appendAguiEvent(entry, aguiEvent, aguiEventCounts);
            appendedAguiEventCount += 1;
          }
        }
      }

      const aguiEvents = translator.translate(event);
      for (const aguiEvent of aguiEvents) {
        if (isTerminal(aguiEvent)) {
          void finalizeTurn(aguiEvent);
          continue;
        }
        appendAguiEvent(entry, aguiEvent, aguiEventCounts);
        appendedAguiEventCount += 1;
        if (!snapshotAppended && aguiEvent.type === EventType.RUN_STARTED) {
          appendAguiEvent(
            entry,
            {
              type: EventType.MESSAGES_SNAPSHOT,
              messages: snapshotMessages,
              timestamp: Date.now(),
            },
            aguiEventCounts,
          );
          appendedAguiEventCount += 1;
          snapshotAppended = true;
        }
      }
      if (isSyncPoint(event)) {
        entry.snapshotCursorSeq = ensureEventLog(entry).lastSeq;
      }
    });

    entry.activeRun = {
      runId,
      startSeq,
      unsubscribe,
      sawTerminal: false,
    };

    const releaseTurnSink = retainTraceSink(runId);

    const promptStop = log.startTimer("session.prompt_execution");
    runtime.session
      .prompt(promptText, piImages.length > 0 ? { images: piImages } : undefined)
      .then(async () => {
        promptStop();
        log.info("session.prompt_complete", { sessionId, runId });
        await terminalFlush;
        if (!entry.activeRun?.sawTerminal) {
          await finalizeTurn({
            type: EventType.RUN_FINISHED,
            threadId: sessionId,
            runId,
            timestamp: Date.now(),
          });
        }
        unsubscribe();
        entry.activeRun = undefined;
        logCollectorSummary("complete");
        await releaseTurnSink();
      })
      .catch(async (err) => {
        promptStop();
        log.error("session.prompt_error", { sessionId, runId, message: String(err) });
        await terminalFlush;
        if (!entry.activeRun?.sawTerminal) {
          await finalizeTurn({
            type: EventType.RUN_ERROR,
            threadId: sessionId,
            runId,
            message: String(err),
            timestamp: Date.now(),
          });
        }
        unsubscribe();
        entry.activeRun = undefined;
        logCollectorSummary("error");
        await releaseTurnSink();
      });
  }

  async sendPrompt(
    sessionId: string,
    prompt: string,
    messages?: SnapshotMessage[],
    runId: string = crypto.randomUUID(),
    options?: { modelId?: string; thinkingLevel?: ThinkingLevel },
  ): Promise<ReadableStream<Uint8Array>> {
    const log = getTraceLogger("worker");
    const entry = this.registry.getRaw(sessionId);
    if (!entry) {
      log.error("session.not_found", { sessionId });
      throw new Error("Session not found");
    }

    // b1: model + thinkingLevel are turn config — apply here, not in getOrCreateSession.
    // Guard isStreaming lives here; only switch if different.
    if (options?.modelId) {
      const current = entry.runtime.session.model;
      const currentRef = current ? `${current.provider}/${current.id}` : undefined;
      if (currentRef !== options.modelId) {
        if (entry.runtime.session.isStreaming || entry.activeRun) {
          log.warn("session.model_change_blocked_streaming", { sessionId, modelId: options.modelId });
          throw new Error("Cannot change model while the agent is running");
        }
        const { provider: piProvider, model: piModelId } = splitModelReference(options.modelId);
        const services = (entry.runtime as unknown as { services?: { modelRegistry?: { find: (p: string, m: string) => unknown } } })
          .services;
        const model =
          piProvider && piModelId && services?.modelRegistry
            ? services.modelRegistry.find(piProvider, piModelId)
            : undefined;
        if (model) {
          await entry.runtime.session.setModel(model as never);
          log.info("session.model_changed", { sessionId, modelId: options.modelId });
        } else {
          log.warn("session.model_not_in_registry", { sessionId, modelId: options.modelId });
        }
      }
    }
    if (options?.thinkingLevel) {
      // Only apply if different? Pi clamps anyway; cheap to always set. We check diff to avoid redundant global write.
      const currentLevel = (entry.runtime.session as unknown as { thinkingLevel?: string }).thinkingLevel;
      if (currentLevel !== options.thinkingLevel) {
        applyThinkingLevel(entry.runtime.session as never, options.thinkingLevel);
      }
    }

    const s = entry.runtime.session as unknown as {
      thinkingLevel?: string;
      model?: {
        id?: string;
        api?: string;
        reasoning?: boolean;
        provider?: string;
        baseUrl?: string;
        compat?: unknown;
      };
    };
    log.info("debug.agent_state", {
      sessionId,
      thinkingLevel: s.thinkingLevel,
      modelId: s.model?.id,
      api: s.model?.api,
      reasoning: s.model?.reasoning,
      provider: s.model?.provider,
      baseUrl: s.model?.baseUrl,
      compat: s.model?.compat,
    });

    const loadedSkills = entry.runtime.services?.resourceLoader?.getSkills().skills ?? [];
    log.info("debug.skills_state", {
      sessionId,
      skillCount: loadedSkills.length,
      skillPaths: loadedSkills.map((skill) => skill.filePath),
    });

    {
      const sysPrompt = entry.runtime.session.systemPrompt ?? "";
      const rl = entry.runtime.services?.resourceLoader;
      log.info("debug.prompt_bootstrap_before", {
        sessionId,
        runId,
        mechanism: "context (extension, user message prepend)",
        hasBootstrapInSystemPromptBefore: sysPrompt.includes("You have superpowers"),
        systemPromptLengthBefore: sysPrompt.length,
        systemPromptPreviewBefore: sysPrompt.slice(0, 300),
        promptLength: prompt.length,
        promptPreview: prompt.slice(0, 300),
        skillCount: loadedSkills.length,
        extensionCount: rl?.getExtensions().extensions.length ?? 0,
        appendSystemPrompt: rl?.getAppendSystemPrompt() ?? [],
      });
    }

    const eventLog = ensureEventLog(entry);
    const afterSeq = eventLog.lastSeq;
    const turnBaseline = await captureTurnBaseline(entry);
    this.startPromptCollector(entry, prompt, runId, messages, turnBaseline);
    return this.createEventStream(
      "session.prompt_stream",
      "session.prompt_stream.summary",
      afterSeq,
      () => ({ entry, eventLog, prelude: [], events: eventLog.readAfter(afterSeq) }),
    );
  }

  async connectToSession(
    sessionId: string,
    cursor: Cursor,
    parentSessionId?: string,
  ): Promise<ReadableStream<Uint8Array>> {
    const log = getTraceLogger("worker");
    return this.createEventStream("connect.stream", "connect.stream_summary", cursor.seq, () => {
      const entry = this.registry.get(sessionId, parentSessionId);
      if (!entry) {
        log.info("connect.session_not_found", { sessionId });
        return null;
      }
      const eventLog = ensureEventLog(entry);
      const { prelude, events } = eventLog.replayAfter(cursor);
      return { entry, eventLog, prelude, events };
    });
  }

  /**
   * Enqueue a plain-text follow-up delivered at end-of-turn. The chip is
   * driven by events, not by this return value: `session.followUp` emits
   * Pi's `queue_update` synchronously through the collector subscription,
   * which the translator re-emits as the AG-UI CUSTOM queue event — one
   * single append path, so the worker queues, the agent queues and the UI
   * event can never diverge. Delivery later removes exactly one entry
   * (SDK `message_start`) and the injected text is surfaced inside the
   * active turn by the collector (see `startPromptCollector`).
   */
  async followUp(
    sessionId: string,
    text: string,
  ): Promise<{
    queued: boolean;
    pending: { steering: string[]; followUp: string[] };
  }> {
    const log = getTraceLogger("worker");
    const entry = this.registry.getRaw(sessionId);
    if (!entry) {
      log.error("session.not_found", { sessionId });
      throw new Error("Session not found");
    }
    assertPlainQueueText(text);
    if (!entry.activeRun && !entry.runtime.session.isStreaming) {
      throw new Error("Cannot queue a follow-up while no turn is running");
    }
    await entry.runtime.session.followUp(text);
    const pending = {
      steering: [...entry.runtime.session.getSteeringMessages()],
      followUp: [...entry.runtime.session.getFollowUpMessages()],
    };
    log.info("session.followup_queued", {
      sessionId,
      textLength: text.length,
      steeringCount: pending.steering.length,
      followUpCount: pending.followUp.length,
    });
    return { queued: true, pending };
  }

  /**
   * Discard every queued message and report what was removed. Base of the
   * chip's edit (clear + draft back to the textarea, never auto-reenqueue)
   * and delete (clear + discard) actions. Clearing is idempotent: an empty
   * queue returns empty lists, never an error.
   */
  async clearQueue(sessionId: string): Promise<{
    cleared: { steering: string[]; followUp: string[] };
    pending: { steering: string[]; followUp: string[] };
  }> {
    const log = getTraceLogger("worker");
    const entry = this.registry.getRaw(sessionId);
    if (!entry) {
      log.error("session.not_found", { sessionId });
      throw new Error("Session not found");
    }
    const clearedRaw = entry.runtime.session.clearQueue() as {
      steering?: unknown;
      followUp?: unknown;
    };
    const cleared = {
      steering: Array.isArray(clearedRaw?.steering)
        ? [...(clearedRaw.steering as string[])]
        : [],
      followUp: Array.isArray(clearedRaw?.followUp)
        ? [...(clearedRaw.followUp as string[])]
        : [],
    };
    const pending = {
      steering: [...entry.runtime.session.getSteeringMessages()],
      followUp: [...entry.runtime.session.getFollowUpMessages()],
    };
    log.info("session.queue_cleared", {
      sessionId,
      clearedSteeringCount: cleared.steering.length,
      clearedFollowUpCount: cleared.followUp.length,
    });
    return { cleared, pending };
  }

  /**
   * Promote the pending follow-up to steering: clear-then-enqueue in one
   * logical worker-side operation. The SDK keeps two independent queues
   * with no dedup, so steering without clearing first would execute the
   * same text twice (end-of-turn AND next-request) with double LLM cost.
   * `session.steer` never aborts running tools: it delivers after the
   * current assistant turn, before the next LLM call. Delivery later
   * surfaces inside the active turn via the collector (see
   * `startPromptCollector`), under the same runId.
   */
  async steer(
    sessionId: string,
    text: string,
  ): Promise<{
    steered: boolean;
    cleared: { steering: string[]; followUp: string[] };
    pending: { steering: string[]; followUp: string[] };
  }> {
    const log = getTraceLogger("worker");
    const entry = this.registry.getRaw(sessionId);
    if (!entry) {
      log.error("session.not_found", { sessionId });
      throw new Error("Session not found");
    }
    assertPlainQueueText(text);
    if (!entry.activeRun && !entry.runtime.session.isStreaming) {
      throw new Error("Cannot steer while no turn is running");
    }
    const clearedRaw = entry.runtime.session.clearQueue() as {
      steering?: unknown;
      followUp?: unknown;
    };
    const cleared = {
      steering: Array.isArray(clearedRaw?.steering)
        ? [...(clearedRaw.steering as string[])]
        : [],
      followUp: Array.isArray(clearedRaw?.followUp)
        ? [...(clearedRaw.followUp as string[])]
        : [],
    };
    await entry.runtime.session.steer(text);
    const pending = {
      steering: [...entry.runtime.session.getSteeringMessages()],
      followUp: [...entry.runtime.session.getFollowUpMessages()],
    };
    log.info("session.steer_queued", {
      sessionId,
      textLength: text.length,
      clearedSteeringCount: cleared.steering.length,
      clearedFollowUpCount: cleared.followUp.length,
      steeringCount: pending.steering.length,
      followUpCount: pending.followUp.length,
    });
    return { steered: true, cleared, pending };
  }

  async cancelRun(sessionId: string): Promise<{ cancelled: boolean }> {
    const log = getTraceLogger("worker");
    const entry = this.registry.getRaw(sessionId);
    if (!entry) {
      log.info("cancel.session_not_found", { sessionId });
      return { cancelled: false };
    }
    log.info("cancel.requested", { sessionId });
    await entry.runtime.session.abort();
    return { cancelled: true };
  }
}
