import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import {
  createAgentSessionRuntime,
  createAgentSessionFromServices,
  createAgentSessionServices,
  getAgentDir,
  SessionManager,
  AuthStorage,
  ModelRegistry,
  stripFrontmatter,
  type CreateAgentSessionRuntimeFactory,
} from "@earendil-works/pi-coding-agent";
import { getTraceLogger } from "tracing";
import { SessionEventLog, type LoggedAguiEvent } from "./event-log";
import { buildReconnectPrelude } from "./reconnect-prelude";
import { compactReplayEvents } from "./replay-compaction";
import { AguiEventType as EventType, PiToAguiTranslator, type BaseEvent } from "./pi-to-agui-translator";
import { FILE_REFERENCE_PROMPT } from "./file-reference-prompt";
import { getModelsJsonPath } from "./models";
import {
  extractUserContentParts,
  inlineAttachedFiles,
  splitAttachedFiles,
} from "./attached-files";
import {
  captureGitFileState,
  diffTurnFiles,
  type GitFileState,
} from "./turn-git-state";
import type { CodingAgentEvent } from "./index";

export const FILES_CHANGED_EVENT = "coding_agent_files_changed";
import {
  assistantMessageId,
  reasoningMessageId,
  toolResultMessageId,
  userMessageId,
  IdDeduper,
} from "./message-ids";

interface SnapshotMessage {
  id?: string;
  role: string;
  content?: unknown;
  toolCalls?: unknown;
  toolCallId?: string;
  name?: string;
}

export interface CodingAgentSkill {
  name: string;
  description: string;
}

interface SessionEntry {
  sessionId: string;
  piSessionId: string;
  project: string;
  runtime: Awaited<ReturnType<typeof createAgentSessionRuntime>>;
  eventLog?: SessionEventLog;
  activeRun?: {
    runId: string;
    startSeq: number;
    unsubscribe: () => void;
    sawTerminal: boolean;
  };
  /**
   * eventLog.lastSeq as of the most recently finalized message (user,
   * assistant, or tool result) in this worker's lifetime. A message
   * "finalizes" when Pi pushes it into `session.messages` — which is also
   * exactly when it becomes visible to a fresh `getSessionMessages` /ssr
   * fetch. This is the seq `getSessionSnapshot` reports as the cursor: it
   * points just after the last finalized message, so a client replaying
   * from it only receives the still-partial tail of an in-progress run
   * rather than deltas for messages its snapshot already has in full.
   */
  snapshotCursorSeq?: number;
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

const LEADING_SKILL_COMMANDS =
  /^((?:\/skill:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:[ \t]+|(?=\r?\n|$)))+)([\s\S]*)$/;
const SKILL_NAME = /\/skill:([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)/g;

/**
 * Pi expands one leading /skill command itself. The web composer supports
 * selecting several skills, so expand the complete leading command sequence
 * before handing the prompt to Pi.
 */
function expandLeadingSkillCommands(
  runtime: SessionEntry["runtime"],
  text: string,
): string {
  const match = text.match(LEADING_SKILL_COMMANDS);
  if (!match) return text;

  const availableSkills = runtime.session.resourceLoader.getSkills().skills;
  const names = Array.from(
    match[1]!.matchAll(SKILL_NAME),
    (command) => command[1]!,
  );
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
    const authStorage = AuthStorage.create(
      path.join(getAgentDir(), "auth.json"),
    );
    const services = await createAgentSessionServices({
      cwd: runtimeCwd,
      authStorage,
      modelRegistry: ModelRegistry.create(authStorage, getModelsJsonPath()),
      resourceLoaderOptions: {
        appendSystemPrompt: [FILE_REFERENCE_PROMPT],
      },
    });
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

      if (!entry.runtime.session.isStreaming && !entry.activeRun) {
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

function sessionCwd(entry: SessionEntry): string | null {
  const root = process.env.CODING_AGENT_PROJECTS_ROOT;
  if (!root) return null;
  try {
    return resolveProjectPath(root, entry.project);
  } catch {
    return null;
  }
}

/**
 * Baseline of the repo's dirty files taken when a run starts. Resolves to
 * null when the project is not a git repo (or git is unavailable), which
 * disables the files-changed event for the run.
 */
function captureTurnBaseline(entry: SessionEntry): Promise<GitFileState | null> {
  const cwd = sessionCwd(entry);
  if (!cwd) return Promise.resolve(null);
  return captureGitFileState(cwd).catch(() => null);
}

function startPromptCollector(
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
  // Invariant: the run-start snapshot is canonical history plus the new user
  // message carrying the client's id. That id is stamped onto Pi's own
  // message record below (on its `message_end`), so every later derivation
  // of this message — history load, reconnect snapshot, worker restart —
  // reproduces the same id via `convertPiMessagesToAgui`.
  const preRunHistory = convertPiMessagesToAgui(runtime.session.messages);
  const clientMessages = normalizeSnapshotMessages(messages);
  const lastClientMessage = clientMessages[clientMessages.length - 1];
  const userTail =
    lastClientMessage && lastClientMessage.role === "user"
      ? [lastClientMessage]
      : [{ id: crypto.randomUUID(), role: "user", content: prompt }];
  const userMessageClientId = userTail[0].id as string;
  const snapshotMessages = [...preRunHistory, ...userTail];

  // The client's tail message may carry structured AG-UI content (images /
  // text-file attachments) instead of plain text. Text-file content has no
  // native slot in Pi's prompt() — it is inlined into the prompt text as a
  // reversible fenced block (see attached-files.ts) so convertPiMessagesToAgui
  // can reconstruct the original attachment on reload. Images go through
  // natively via PromptOptions.images.
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

  // AG-UI forbids any event after RUN_FINISHED/RUN_ERROR, so the
  // files-changed diff (which needs async git calls) must be computed and
  // appended BEFORE the terminal event. Terminal events therefore don't get
  // appended synchronously by the subscriber: they are routed through here,
  // which emits the CUSTOM files-changed event (when the turn touched
  // files) and only then the terminal event itself.
  const finalizeTurn = (terminalEvent: BaseEvent): Promise<void> => {
    const flush = (async () => {
      try {
        if (turnBaseline) {
          const cwd = sessionCwd(entry);
          const after = cwd ? await captureGitFileState(cwd) : null;
          const files = diffTurnFiles(turnBaseline, after);
          if (files.length > 0) {
            appendAguiEvent(entry, {
              type: EventType.CUSTOM,
              name: FILES_CHANGED_EVENT,
              value: { runId, files },
              timestamp: Date.now(),
            } as BaseEvent, aguiEventCounts);
            appendedAguiEventCount += 1;
          }
        }
      } catch (err) {
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
    log.debug("pi.event", { type: event.type });

    // Stamp the client's id onto Pi's own message object before it gets
    // persisted. Pi's AgentSession emits `message_end` synchronously and
    // only appends the message to `session.messages` (and to disk) right
    // after — mutating the same object reference here is durable and makes
    // this the one place a message's identity is permanently fixed.
    if (!userMessageStamped && event.type === "message_end" && event.message?.role === "user") {
      userMessageStamped = true;
      (event.message as Record<string, unknown>).clientMessageId = userMessageClientId;
      (event.message as Record<string, unknown>).clientPromptText = extracted.text;
    }

    const aguiEvents = translator.translate(event);
    for (const aguiEvent of aguiEvents) {
      if (isTerminalAguiEvent(aguiEvent)) {
        void finalizeTurn(aguiEvent);
        continue;
      }
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
    // A message just became part of Pi's canonical `session.messages` (and
    // thus of any SSR fetch made from this point on). Move the snapshot
    // cursor past it so a client that re-snapshots and reconnects never
    // replays deltas it already has in full — see `snapshotCursorSeq` on
    // SessionEntry.
    if (event.type === "message_end" || event.type === "tool_execution_end") {
      entry.snapshotCursorSeq = ensureEventLog(entry).lastSeq;
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
    .prompt(promptText, piImages.length > 0 ? { images: piImages } : undefined)
    .then(async () => {
      promptStop();
      log.info("session.prompt_complete", { sessionId, runId });
      // A translated terminal event may still be flushing its files-changed
      // diff; wait for it so sawTerminal reflects the appended state.
      await terminalFlush;
      if (!entry.activeRun?.sawTerminal) {
        await finalizeTurn({
          type: EventType.RUN_FINISHED,
          threadId: sessionId,
          runId,
          timestamp: Date.now(),
        } as BaseEvent);
      }
      unsubscribe();
      entry.activeRun = undefined;
      logCollectorSummary("complete");
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
        } as BaseEvent);
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
  // Captured before the run starts so the baseline can never include the
  // agent's own first edits.
  const turnBaseline = await captureTurnBaseline(entry);
  startPromptCollector(entry, prompt, runId, messages, turnBaseline);
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

  return convertPiMessagesToAgui(entry.runtime.session.messages);
}

export function getSessionSkills(sessionId: string): CodingAgentSkill[] {
  const entry = sessions.get(sessionId);
  if (!entry) {
    throw new Error("Session not found");
  }
  return entry.runtime.session.resourceLoader
    .getSkills()
    .skills.map(({ name, description }) => ({ name, description }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Convert Pi session messages to AG-UI-shaped messages.
 *
 * Ids are derived deterministically from each Pi message's own data
 * (timestamp for user/assistant messages, real toolCallId for tool
 * results) so they match the ids the live translator assigns to the same
 * messages during streaming (see message-ids.ts). For a user message that
 * carries a `clientMessageId` (stamped in `startPromptCollector` on its
 * `message_end`), that id takes precedence over the derived timestamp id
 * so the message keeps the exact id the client originated it with. One
 * deduper is shared across the whole conversion so same-millisecond
 * collisions resolve the same way every time it runs. Used by both the
 * history load path and the run-start MESSAGES_SNAPSHOT so a message keeps
 * the same identity in every delivery channel.
 */
function convertPiMessagesToAgui(piMessages: ReadonlyArray<any>): Array<any> {
  const result: Array<any> = [];
  const idDeduper = new IdDeduper();
  piMessages.forEach((msg) => {
    if (msg.role === "user") {
      const baseId =
        typeof msg.clientMessageId === "string" ? msg.clientMessageId : userMessageId(msg.timestamp);
      const id = idDeduper.dedupe(baseId);
      const rawText =
        typeof msg.content === "string" ? msg.content : extractMessageText(msg.content);
      const piImages = Array.isArray(msg.content)
        ? msg.content.filter((c: any) => c && c.type === "image")
        : [];
      const { text, docs } = splitAttachedFiles(rawText);
      const displayText =
        typeof msg.clientPromptText === "string" ? msg.clientPromptText : text;

      if (piImages.length === 0 && docs.length === 0) {
        // No attachments: preserve the exact pre-existing shape (plain string).
        result.push({ id, role: "user", content: displayText });
      } else {
        const parts: unknown[] = [];
        if (displayText.trim().length > 0) {
          parts.push({ type: "text", text: displayText });
        }
        for (const img of piImages) {
          parts.push({
            type: "image",
            source: { type: "data", value: img.data, mimeType: img.mimeType },
          });
        }
        for (const doc of docs) {
          parts.push({
            type: "document",
            source: {
              type: "data",
              value: Buffer.from(doc.content, "utf8").toString("base64"),
              mimeType: doc.mimeType,
            },
            metadata: { filename: doc.filename },
          });
        }
        result.push({ id, role: "user", content: parts });
      }
    } else if (msg.role === "assistant") {
      const id = idDeduper.dedupe(assistantMessageId(msg.timestamp));

      // Extract thinking parts as separate "reasoning" messages if any exist
      if (Array.isArray(msg.content)) {
        const thinking = msg.content
          .filter((c: any) => c.type === "thinking")
          .map((c: any) => c.thinking)
          .join("\n");
        if (thinking) {
          result.push({
            id: reasoningMessageId(id),
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
        id: toolResultMessageId(msg.toolCallId),
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
  const registry = ModelRegistry.create(authStorage, getModelsJsonPath());
  const available = registry.getAvailable();
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

/**
 * Return the model the session is currently using, reloading the session
 * from disk if the worker restarted. On a disk reload no model is forced,
 * so Pi restores the model persisted in the session file.
 */
export async function getSessionModel(
  sessionId: string,
  piSessionId?: string,
  project?: string,
): Promise<{ providerId: string; modelId: string } | null> {
  const log = getTraceLogger("worker");
  let entry = sessions.get(sessionId);

  if (!entry && piSessionId && project) {
    log.info("session.model_load_disk", { sessionId, piSessionId });
    entry = await loadSessionFromDisk(sessionId, piSessionId, project);
  }

  if (!entry) {
    log.info("session.model_not_found", { sessionId });
    return null;
  }

  const model = entry.runtime.session.model;
  if (!model) return null;
  return { providerId: model.provider, modelId: model.id };
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

export interface SessionCursor {
  epoch: string;
  seq: number;
}

export interface SessionSnapshot {
  messages: Array<any>;
  cursor: SessionCursor | null;
  running: boolean;
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

/**
 * Return the conversation state and the exact event-log boundary it represents.
 *
 * Pi only commits a message to `session.messages` once it is finalized. When a
 * run is in progress, the snapshot therefore deliberately points at the last
 * finalized message so the client replays the remaining partial deltas. This
 * makes the worker, rather than SSR or the browser, the single authority for
 * both the snapshot and its resume cursor.
 */
export async function getSessionSnapshot(
  sessionId: string,
  piSessionId?: string,
  project?: string,
): Promise<SessionSnapshot> {
  const messages = await getSessionMessages(sessionId, piSessionId, project);
  const entry = sessions.get(sessionId);
  if (!entry) {
    return { messages, cursor: null, running: false };
  }

  const eventLog = ensureEventLog(entry);
  const seq = entry.snapshotCursorSeq ?? eventLog.lastSeq;
  return {
    messages,
    cursor: { epoch: eventLog.epoch, seq },
    running: entry.runtime.session.isStreaming || !!entry.activeRun,
  };
}

export async function connectToSession(
  sessionId: string,
  onEvent: (line: string) => void,
  onError: (err: Error) => void,
  onComplete: (() => void) | undefined,
  afterSeq: number,
  epoch: string,
): Promise<() => void> {
  const log = getTraceLogger("worker");
  const eventCounts: Record<string, number> = {};
  let emittedLineCount = 0;
  let replayLineCount = 0;
  let connectClosed = false;
  let eventLogLastSeq = 0;

  const logConnectSummary = (reason: string) => {
    if (connectClosed) return;
    connectClosed = true;
    log.info("connect.stream_summary", {
      sessionId,
      reason,
      afterSeq,
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
  if (epoch !== eventLog.epoch) {
    throw new Error("Cursor epoch mismatch");
  }
  eventLogLastSeq = eventLog.lastSeq;

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

  // The cursor may fall inside an open tool call or step (the client cut away
  // mid-stream). The reconnect run's AG-UI verifier starts with empty state,
  // so re-open those with synthetic events before replaying the tail —
  // otherwise the first orphan TOOL_CALL_ARGS/STEP_FINISHED kills the run and
  // everything behind it (including the terminal events) is never delivered.
  const prelude = buildReconnectPrelude(eventLog.readUpTo(afterSeq));
  if (prelude.length > 0) {
    const preludeCounts: Record<string, number> = {};
    for (const event of prelude) incrementCount(preludeCounts, event.type);
    log.info("connect.synthetic_prelude", {
      sessionId,
      afterSeq,
      eventCounts: preludeCounts,
    });
    for (const event of prelude) {
      // Reuse the cursor's seq: the bridge re-emits it as the client cursor,
      // which must not advance past events the client has not replayed yet.
      emitLogged({ epoch: eventLog.epoch, seq: afterSeq, event }, false);
    }
    if (closed) return () => {};
  }

  // Merge consecutive streaming deltas (reasoning/text chunks, tool call
  // args) before replaying: verbatim replays of long sessions push thousands
  // of micro-events through the client, saturating the browser main thread.
  const rawReplay = eventLog.readAfter(afterSeq);
  const replay = compactReplayEvents(rawReplay);
  log.info("connect.replay", {
    sessionId,
    afterSeq,
    replayCount: replay.length,
    rawReplayCount: rawReplay.length,
    eventLogLastSeq: eventLog.lastSeq,
    isStreaming: entry.runtime.session.isStreaming,
    hasActiveRun: !!entry.activeRun,
  });
  for (let i = 0; i < replay.length; i += 1) {
    replayLineCount += 1;
    emitLogged(replay[i]!, i === replay.length - 1);
  }

  if (closed) return () => {};

  if (!entry.runtime.session.isStreaming && !entry.activeRun) {
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
