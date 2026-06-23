import path from "node:path";
import { existsSync } from "node:fs";
import {
  createAgentSessionRuntime,
  createAgentSessionFromServices,
  createAgentSessionServices,
  getAgentDir,
  SessionManager,
  AuthStorage,
  ModelRegistry,
  type CreateAgentSessionRuntimeFactory,
} from "@earendil-works/pi-coding-agent";
import { getTraceLogger } from "tracing";
import { SessionEventLog, type LoggedAguiEvent } from "./event-log";
import { AguiEventType as EventType, PiToAguiTranslator, type BaseEvent } from "./pi-to-agui-translator";
import type { CodingAgentEvent } from "./index";

interface InFlightTool {
  toolCallId: string;
  name: string;
  argsSoFar: string;
  parentMessageId?: string;
  callEnded: boolean;
}

interface SnapshotMessage {
  id?: string;
  role: string;
  content?: unknown;
  toolCalls?: unknown;
  toolCallId?: string;
  name?: string;
}

interface SessionEntry {
  sessionId: string;
  piSessionId: string;
  project: string;
  runtime: Awaited<ReturnType<typeof createAgentSessionRuntime>>;
  inFlightTools: Map<number, InFlightTool>;
  eventLog?: SessionEventLog;
  activeRun?: {
    runId: string;
    startSeq: number;
    unsubscribe: () => void;
    sawTerminal: boolean;
  };
}

const sessions = new Map<string, SessionEntry>();

function incrementCount(counts: Record<string, number>, key: string | undefined): void {
  if (!key) return;
  counts[key] = (counts[key] ?? 0) + 1;
}

function ensureEventLog(entry: SessionEntry): SessionEventLog {
  entry.eventLog ??= new SessionEventLog();
  return entry.eventLog;
}

function isTerminalAguiEvent(event: BaseEvent): boolean {
  return event.type === EventType.RUN_FINISHED || event.type === EventType.RUN_ERROR;
}

function loggedLine(entry: LoggedAguiEvent): string {
  return `${JSON.stringify(entry)}\n`;
}

function appendAguiEvent(
  entry: SessionEntry,
  event: BaseEvent,
  eventCounts?: Record<string, number>,
): LoggedAguiEvent {
  incrementCount(eventCounts ?? {}, event.type);
  const logged = ensureEventLog(entry).append(event);
  if (isTerminalAguiEvent(event) && entry.activeRun) {
    entry.activeRun.sawTerminal = true;
  }
  return logged;
}

function normalizeSnapshotMessages(
  messages: SnapshotMessage[] | undefined,
): SnapshotMessage[] {
  return (messages ?? [])
    .filter((message): message is SnapshotMessage => (
      typeof message === "object" &&
      message !== null &&
      typeof message.role === "string"
    ))
    .map((message, index) => ({
      id: typeof message.id === "string" ? message.id : `snapshot-${index}`,
      role: message.role,
      content: message.content ?? "",
      ...(Array.isArray(message.toolCalls) ? { toolCalls: message.toolCalls } : {}),
      ...(typeof message.toolCallId === "string" ? { toolCallId: message.toolCallId } : {}),
      ...(typeof message.name === "string" ? { name: message.name } : {}),
    }));
}

function updateInFlightTools(
  entry: SessionEntry,
  event: CodingAgentEvent,
): void {
  const log = getTraceLogger("worker");
  const { sessionId } = entry;

  if (event.type === "message_update") {
    const ame = event.assistantMessageEvent as
      | { type: string; contentIndex?: number; toolCall?: { id?: string; name?: string }; delta?: string }
      | undefined;
    if (ame?.type === "toolcall_start" && typeof ame.contentIndex === "number") {
      const toolCallId = ame.toolCall?.id ?? `tool-${crypto.randomUUID()}`;
      const partial = (ame as { partial?: { content?: unknown[] } }).partial;
      const block =
        partial && Array.isArray(partial.content)
          ? partial.content[ame.contentIndex]
          : undefined;
      const blockName =
        block && typeof block === "object" && block !== null && "name" in block
          ? (block as { name?: unknown }).name
          : undefined;
      const name =
        (typeof blockName === "string" ? blockName : undefined) ??
        ame.toolCall?.name ??
        "unknown";
      entry.inFlightTools.set(ame.contentIndex, {
        toolCallId,
        name,
        argsSoFar: "",
        callEnded: false,
      });
      log.info("inflight.toolcall_start", { sessionId, contentIndex: ame.contentIndex, toolCallId, name });
    } else if (ame?.type === "toolcall_delta" && typeof ame.contentIndex === "number") {
      const t = entry.inFlightTools.get(ame.contentIndex);
      if (t) t.argsSoFar += ame.delta ?? "";
    } else if (ame?.type === "toolcall_end" && typeof ame.contentIndex === "number") {
      const t = entry.inFlightTools.get(ame.contentIndex);
      if (t) {
        t.callEnded = true;
        log.info("inflight.toolcall_end", { sessionId, contentIndex: ame.contentIndex, toolCallId: t.toolCallId });
      }
    }
  } else if (event.type === "tool_execution_start") {
    const toolCallId = (event as { toolCallId?: string }).toolCallId;
    const toolName = (event as { toolName?: string }).toolName;
    log.info("inflight.tool_execution_start", { sessionId, toolCallId, toolName });
    if (toolCallId && toolName) {
      let matchedKey: number | undefined;
      for (const [contentIndex, tool] of entry.inFlightTools) {
        if (tool.name === toolName && tool.toolCallId.startsWith("tool-")) {
          matchedKey = contentIndex;
          break;
        }
      }
      if (matchedKey !== undefined) {
        const tool = entry.inFlightTools.get(matchedKey)!;
        const oldId = tool.toolCallId;
        tool.toolCallId = toolCallId;
        log.info("inflight.tool_execution_start_mapped", {
          sessionId,
          contentIndex: matchedKey,
          oldId,
          newId: toolCallId,
          toolName,
        });
      } else {
        log.warn("inflight.tool_execution_start_no_match", {
          sessionId,
          toolCallId,
          toolName,
          inFlight: Array.from(entry.inFlightTools.values()).map((t) => ({
            id: t.toolCallId,
            name: t.name,
          })),
        });
      }
    }
  } else if (event.type === "tool_execution_end") {
    const toolCallId = (event as { toolCallId?: string }).toolCallId;
    if (toolCallId) {
      let found = false;
      for (const [contentIndex, tool] of entry.inFlightTools) {
        if (tool.toolCallId === toolCallId) {
          entry.inFlightTools.delete(contentIndex);
          log.info("inflight.tool_execution_end_removed", {
            sessionId,
            contentIndex,
            toolCallId,
          });
          found = true;
          break;
        }
      }
      if (!found) {
        log.warn("inflight.tool_execution_end_not_found", { sessionId, toolCallId });
      }
    }
  }
}

/**
 * @internal Test-only helpers. Not part of the public API.
 * The Map above is module-private, so we expose these narrowly-scoped
 * hooks for unit tests to seed and reset session state without
 * touching the real session-runtime / disk-load codepath.
 */
export function __seedSessionForTests(
  sessionId: string,
  entry: SessionEntry,
): void {
  sessions.set(sessionId, entry);
}

export function __resetSessionsForTests(): void {
  sessions.clear();
}

function isValidProjectName(name: string): boolean {
  if (
    !name ||
    name.includes("/") ||
    name.includes("\\") ||
    name === "." ||
    name === ".."
  ) {
    return false;
  }
  return /^[a-zA-Z0-9_.-]+$/.test(name);
}

function resolveProjectPath(root: string, project: string): string {
  if (!isValidProjectName(project)) {
    throw new Error("Invalid project name");
  }
  return path.resolve(root, project);
}

/**
 * Create the runtime factory reused for both new and reloaded sessions.
 */
function makeCreateRuntime(
  modelId?: string,
): CreateAgentSessionRuntimeFactory {
  return async ({ cwd: runtimeCwd, sessionManager, sessionStartEvent }) => {
    const services = await createAgentSessionServices({ cwd: runtimeCwd });
    const [piProvider, piModelId] = modelId?.split("/") ?? [];
    const model =
      piProvider && piModelId
          ? services.modelRegistry.find(piProvider, piModelId)
          : undefined;
    return {
      ...(await createAgentSessionFromServices({
        services,
        sessionManager,
        sessionStartEvent,
        model,
      })),
      services,
      diagnostics: services.diagnostics,
    };
  };
}

/**
 * Load a session from disk by its Pi SDK session ID.
 * Returns the session entry if found and loaded, undefined otherwise.
 */
async function loadSessionFromDisk(
  appSessionId: string,
  piSessionId: string,
  project: string,
  modelId?: string,
): Promise<SessionEntry | undefined> {
  const log = getTraceLogger("worker");
  const sessionsDir = process.env.CODING_AGENT_SESSIONS_DIR!;
  const projectsRoot = process.env.CODING_AGENT_PROJECTS_ROOT!;
  const cwd = resolveProjectPath(projectsRoot, project);

  log.info("session.load_disk_attempt", { appSessionId, piSessionId });

  // Find the session file by listing sessions for the sessions dir
  const allSessions = await SessionManager.list(sessionsDir);
  const found = allSessions.find((s) => s.id === piSessionId);

  if (!found || !existsSync(found.path)) {
    log.warn("session.load_disk_not_found", { piSessionId, sessionsChecked: allSessions.length });
    return undefined;
  }

  log.info("session.load_disk_found", { path: found.path });

  const sessionManager = SessionManager.open(found.path, sessionsDir);
  const createRuntime = makeCreateRuntime(modelId);

  const stop = log.startTimer("session.runtime_create");
  const runtime = await createAgentSessionRuntime(createRuntime, {
    cwd,
    agentDir: getAgentDir(),
    sessionManager,
  });
  stop();

  const entry: SessionEntry = {
    sessionId: appSessionId,
    piSessionId,
    project,
    runtime,
    inFlightTools: new Map(),
    eventLog: new SessionEventLog(),
  };
  sessions.set(appSessionId, entry);
  log.info("session.load_disk_done", { appSessionId, piSessionId });
  return entry;
}

export async function getOrCreateSession(options: {
  userId: string;
  project: string;
  sessionId?: string;
  modelId?: string;
  piSessionId?: string;
}): Promise<{ sessionId: string; piSessionId: string }> {
  const log = getTraceLogger("worker");

  // 1. Reuse existing in-memory session
  const existing = options.sessionId
    ? sessions.get(options.sessionId)
    : undefined;

  if (existing && existing.project === options.project) {
    log.info("session.reuse", { sessionId: existing.sessionId });
    if (options.modelId) {
      const current = existing.runtime.session.model;
      if (current && `${current.provider}/${current.id}` !== options.modelId) {
        const [piProvider, piModelId] = options.modelId.split("/");
        const model =
          piProvider && piModelId
              ? existing.runtime.services.modelRegistry.find(piProvider, piModelId)
              : undefined;
        if (model) {
          await existing.runtime.session.setModel(model);
          log.info("session.model_changed", {
            sessionId: existing.sessionId,
            modelId: options.modelId,
          });
        }
      }
    }
    return {
      sessionId: existing.sessionId,
      piSessionId: existing.piSessionId,
    };
  }

  // 2. Try to reload from disk if piSessionId is provided (worker restarted)
  if (options.sessionId && options.piSessionId) {
    const loaded = await loadSessionFromDisk(
      options.sessionId,
      options.piSessionId,
      options.project,
      options.modelId,
    );
    if (loaded) {
      return { sessionId: loaded.sessionId, piSessionId: loaded.piSessionId };
    }
  }

  // 3. Create a brand-new Pi SDK session
  const sessionId = options.sessionId ?? crypto.randomUUID();
  const projectsRoot = process.env.CODING_AGENT_PROJECTS_ROOT!;
  const cwd = resolveProjectPath(projectsRoot, options.project);

  log.info("session.create", {
    sessionId,
    project: options.project,
    modelId: options.modelId,
  });

  const sessionManager = SessionManager.create(
    process.env.CODING_AGENT_SESSIONS_DIR!,
  );
  const piSessionId = sessionManager.getSessionId();
  const createRuntime = makeCreateRuntime(options.modelId);

  const stop = log.startTimer("session.runtime_create");
  const runtime = await createAgentSessionRuntime(createRuntime, {
    cwd,
    agentDir: getAgentDir(),
    sessionManager,
  });
  stop();

  sessions.set(sessionId, {
    sessionId,
    piSessionId,
    project: options.project,
    runtime,
    inFlightTools: new Map(),
    eventLog: new SessionEventLog(),
  });
  return { sessionId, piSessionId };
}

function createLoggedEventStream(
  entry: SessionEntry,
  afterSeq: number,
  label: string,
): ReadableStream<Uint8Array> {
  const log = getTraceLogger("worker");
  const { sessionId } = entry;
  const eventLog = ensureEventLog(entry);
  const encoder = new TextEncoder();
  let enqueuedLineCount = 0;
  let enqueueErrorCount = 0;
  const eventCounts: Record<string, number> = {};
  let cleanup: (() => void) | undefined;
  let closed = false;

  const logSummary = (reason: string) => {
    log.info(`${label}.summary`, {
      sessionId,
      reason,
      afterSeq,
      enqueuedLineCount,
      enqueueErrorCount,
      eventCounts,
      eventLogLastSeq: eventLog.lastSeq,
      inFlightToolCount: entry.inFlightTools.size,
    });
  };

  const shouldCloseOnTerminal = (event: BaseEvent) => {
    if (!isTerminalAguiEvent(event)) return false;
    const eventRunId = (event as { runId?: string }).runId;
    return !entry.activeRun || eventRunId === entry.activeRun.runId;
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const close = (reason: string) => {
        if (closed) return;
        closed = true;
        cleanup?.();
        logSummary(reason);
        try {
          controller.close();
        } catch {
          // The browser may already have closed the HTTP stream.
        }
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

      const replay = eventLog.readAfter(afterSeq);
      for (let i = 0; i < replay.length; i += 1) {
        emit(replay[i]!, i === replay.length - 1);
      }
      if (closed) return;

      cleanup = eventLog.subscribe((logged) => emit(logged, true));

      if (!entry.runtime.session.isStreaming && !entry.activeRun && entry.inFlightTools.size === 0) {
        close("idle");
      }
    },
    cancel() {
      if (closed) return;
      closed = true;
      cleanup?.();
      log.info(`${label}.cancelled`, { sessionId });
      logSummary("cancelled");
    },
  });
}

function startPromptCollector(
  entry: SessionEntry,
  prompt: string,
  runId: string,
  messages: SnapshotMessage[] | undefined,
): void {
  const log = getTraceLogger("worker");
  const { sessionId, runtime } = entry;
  if (entry.activeRun || runtime.session.isStreaming) {
    log.warn("session.prompt_already_running", { sessionId });
    throw new Error("Session is already running");
  }

  log.info("session.prompt", {
    sessionId,
    runId,
    promptLength: prompt.length,
    historyMessageCount: messages?.length ?? 0,
  });

  const translator = new PiToAguiTranslator({ threadId: sessionId, runId });
  const snapshotMessages = normalizeSnapshotMessages(messages);
  const startSeq = ensureEventLog(entry).lastSeq + 1;
  const piEventCounts: Record<string, number> = {};
  const aguiEventCounts: Record<string, number> = {};
  let appendedAguiEventCount = 0;
  let snapshotAppended = false;
  let collectorClosed = false;

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
      inFlightToolCount: entry.inFlightTools.size,
      translator: translator.getDiagnostics(),
    });
  };

  const unsubscribe = runtime.session.subscribe((rawEvent) => {
    const event = rawEvent as CodingAgentEvent;
    incrementCount(piEventCounts, event.type);
    log.debug("pi.event", { type: event.type });
    updateInFlightTools(entry, event);

    const aguiEvents = translator.translate(event);
    for (const aguiEvent of aguiEvents) {
      appendAguiEvent(entry, aguiEvent, aguiEventCounts);
      appendedAguiEventCount += 1;
      if (!snapshotAppended && aguiEvent.type === EventType.RUN_STARTED) {
        appendAguiEvent(entry, {
          type: EventType.MESSAGES_SNAPSHOT,
          messages: snapshotMessages,
          timestamp: Date.now(),
        } as BaseEvent, aguiEventCounts);
        appendedAguiEventCount += 1;
        snapshotAppended = true;
      }
    }
  });

  entry.activeRun = {
    runId,
    startSeq,
    unsubscribe,
    sawTerminal: false,
  };

  const promptStop = log.startTimer("session.prompt_execution");
  runtime.session
    .prompt(prompt)
    .then(() => {
      promptStop();
      log.info("session.prompt_complete", { sessionId, runId });
      if (!entry.activeRun?.sawTerminal) {
        appendAguiEvent(entry, {
          type: EventType.RUN_FINISHED,
          threadId: sessionId,
          runId,
          timestamp: Date.now(),
        } as BaseEvent, aguiEventCounts);
        appendedAguiEventCount += 1;
      }
      unsubscribe();
      entry.activeRun = undefined;
      logCollectorSummary("complete");
    })
    .catch((err) => {
      promptStop();
      log.error("session.prompt_error", { sessionId, runId, message: String(err) });
      if (!entry.activeRun?.sawTerminal) {
        appendAguiEvent(entry, {
          type: EventType.RUN_ERROR,
          threadId: sessionId,
          runId,
          message: String(err),
          timestamp: Date.now(),
        } as BaseEvent, aguiEventCounts);
        appendedAguiEventCount += 1;
      }
      unsubscribe();
      entry.activeRun = undefined;
      logCollectorSummary("error");
    });
}

export async function sendPrompt(
  sessionId: string,
  prompt: string,
  messages?: SnapshotMessage[],
  runId: string = crypto.randomUUID(),
): Promise<ReadableStream<Uint8Array>> {
  const log = getTraceLogger("worker");
  const entry = sessions.get(sessionId);
  if (!entry) {
    log.error("session.not_found", { sessionId });
    throw new Error("Session not found");
  }

  const afterSeq = ensureEventLog(entry).lastSeq;
  startPromptCollector(entry, prompt, runId, messages);
  return createLoggedEventStream(entry, afterSeq, "session.prompt_stream");
}

/**
 * Extract text content from a Pi SDK message, handling both string and structured content.
 */
function extractMessageText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter((c: unknown) => (c as { type?: string }).type === "text")
      .map((c: unknown) => (c as { text?: string }).text ?? "")
      .join("\n");
  }
  return "";
}

/**
 * Get messages for a session.
 * If the session is not in the in-memory Map but piSessionId is provided,
 * attempts to load the session from disk first.
 */
export async function getSessionMessages(
  sessionId: string,
  piSessionId?: string,
  project?: string,
): Promise<Array<any>> {
  const log = getTraceLogger("worker");
  let entry = sessions.get(sessionId);

  // If not in memory but we have a piSessionId, try reloading from disk
  if (!entry && piSessionId && project) {
    log.info("session.messages_load_disk", { sessionId, piSessionId });
    const loaded = await loadSessionFromDisk(sessionId, piSessionId, project);
    if (loaded) {
      entry = loaded;
    }
  }

  if (!entry) {
    log.info("session.messages_not_found", { sessionId });
    return [];
  }

  const result: Array<any> = [];
  entry.runtime.session.messages.forEach((msg, index) => {
    const id = `loaded-${index}`;
    if (msg.role === "user") {
      result.push({
        id,
        role: "user",
        content: typeof msg.content === "string" ? msg.content : extractMessageText(msg.content),
      });
    } else if (msg.role === "assistant") {
      // Extract thinking parts as separate "reasoning" messages if any exist
      if (Array.isArray(msg.content)) {
        const thinking = msg.content
          .filter((c: any) => c.type === "thinking")
          .map((c: any) => c.thinking)
          .join("\n");
        if (thinking) {
          result.push({
            id: `${id}-reason`,
            role: "reasoning",
            content: thinking,
          });
        }
      }

      // Map tool calls
      const toolCalls = Array.isArray(msg.content)
        ? msg.content
            .filter((c: any) => c.type === "toolCall")
            .map((tc: any) => ({
              id: tc.id,
              type: "function",
              function: {
                name: tc.name,
                arguments: typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments),
              },
            }))
        : undefined;

      // Text content
      const text = Array.isArray(msg.content)
        ? msg.content
            .filter((c: any) => c.type === "text")
            .map((c: any) => c.text)
            .join("\n")
        : (typeof msg.content === "string" ? msg.content : "");

      result.push({
        id,
        role: "assistant",
        content: text,
        ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
      });
    } else if (msg.role === "toolResult") {
      result.push({
        id,
        role: "tool",
        toolCallId: msg.toolCallId,
        content: Array.isArray(msg.content)
          ? msg.content
              .filter((c: any) => c.type === "text")
              .map((c: any) => c.text)
              .join("\n")
          : (typeof msg.content === "string" ? msg.content : ""),
      });
    }
  });

  return result;
}

export async function getAvailableModels(): Promise<
  Array<{ providerId: string; modelId: string; label: string }>
> {
  const log = getTraceLogger("worker");
  log.info("models.fetch");

  const authStorage = AuthStorage.create(process.env.CODING_AGENT_AUTH_JSON);
  const registry = ModelRegistry.create(authStorage);
  const available = await registry.getAvailable();
  const filtered = available
    .filter((model) => model.provider === "opencode-go")
    .map((model) => ({
      providerId: model.provider,
      modelId: model.id,
      label: `${model.provider}/${model.id}`,
    }));

  log.info("models.result", { count: filtered.length });
  return filtered;
}

export async function disposeSession(sessionId: string): Promise<void> {
  const log = getTraceLogger("worker");
  const entry = sessions.get(sessionId);
  if (entry) {
    log.info("session.dispose", { sessionId });
    entry.runtime.session.dispose();
    sessions.delete(sessionId);
  } else {
    log.warn("session.dispose_not_found", { sessionId });
  }
}

export interface SessionStatus {
  running: boolean;
  piSessionId?: string;
}

export async function getSessionStatus(sessionId: string): Promise<SessionStatus> {
  const log = getTraceLogger("worker");
  const entry = sessions.get(sessionId);
  if (!entry) {
    log.info("session.status_not_found", { sessionId });
    return { running: false };
  }
  if (entry.runtime.session.isStreaming) {
    return { running: true, piSessionId: entry.runtime.session.sessionId };
  }
  return { running: false };
}

export async function connectToSession(
  sessionId: string,
  onEvent: (line: string) => void,
  onError: (err: Error) => void,
  onComplete?: () => void,
  afterSeq = 0,
): Promise<() => void> {
  const log = getTraceLogger("worker");
  const eventCounts: Record<string, number> = {};
  let emittedLineCount = 0;
  let replayLineCount = 0;
  let connectClosed = false;
  let eventLogLastSeq = 0;
  let replayAfterSeq = afterSeq;

  const logConnectSummary = (reason: string) => {
    if (connectClosed) return;
    connectClosed = true;
    log.info("connect.stream_summary", {
      sessionId,
      reason,
      afterSeq,
      replayAfterSeq,
      emittedLineCount,
      replayLineCount,
      eventCounts,
      eventLogLastSeq,
    });
  };

  const entry = sessions.get(sessionId);
  if (!entry) {
    log.info("connect.session_not_found", { sessionId });
    onComplete?.();
    logConnectSummary("session_not_found");
    return () => {};
  }

  const eventLog = ensureEventLog(entry);
  eventLogLastSeq = eventLog.lastSeq;
  replayAfterSeq =
    afterSeq > 0
      ? afterSeq
      : entry.activeRun
        ? Math.max(0, entry.activeRun.startSeq - 1)
        : afterSeq;

  let closed = false;
  let unsubscribe: (() => void) | undefined;

  const finish = (reason: string) => {
    if (closed) return;
    closed = true;
    unsubscribe?.();
    onComplete?.();
    eventLogLastSeq = eventLog.lastSeq;
    logConnectSummary(reason);
  };

  const shouldCloseOnTerminal = (event: BaseEvent) => {
    if (!isTerminalAguiEvent(event)) return false;
    const eventRunId = (event as { runId?: string }).runId;
    return !entry.activeRun || eventRunId === entry.activeRun.runId;
  };

  const emitLogged = (logged: LoggedAguiEvent, closeTerminal: boolean) => {
    if (closed) return;
    try {
      incrementCount(eventCounts, logged.event.type);
      emittedLineCount += 1;
      onEvent(loggedLine(logged));
      if (closeTerminal && shouldCloseOnTerminal(logged.event)) {
        finish("terminal");
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      onError(error);
      finish("error");
    }
  };

  const replay = eventLog.readAfter(replayAfterSeq);
  log.info("connect.replay", {
    sessionId,
    afterSeq,
    replayAfterSeq,
    replayCount: replay.length,
    eventLogLastSeq: eventLog.lastSeq,
    isStreaming: entry.runtime.session.isStreaming,
    hasActiveRun: !!entry.activeRun,
  });
  for (let i = 0; i < replay.length; i += 1) {
    replayLineCount += 1;
    emitLogged(replay[i]!, i === replay.length - 1);
  }

  if (closed) return () => {};

  if (!entry.runtime.session.isStreaming && !entry.activeRun && entry.inFlightTools.size === 0) {
    log.info("connect.idle_completed", { sessionId, afterSeq });
    finish("idle");
    return () => {};
  }

  unsubscribe = eventLog.subscribe((logged) => emitLogged(logged, true));

  return () => {
    if (closed) return;
    closed = true;
    log.info("connect.client_disconnected", { sessionId });
    unsubscribe?.();
    logConnectSummary("client_disconnected");
  };
}

export async function cancelRun(sessionId: string): Promise<{ cancelled: boolean }> {
  const log = getTraceLogger("worker");
  const entry = sessions.get(sessionId);
  if (!entry) {
    log.info("cancel.session_not_found", { sessionId });
    return { cancelled: false };
  }
  log.info("cancel.requested", { sessionId });
  await entry.runtime.session.abort();
  return { cancelled: true };
}
