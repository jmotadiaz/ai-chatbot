import path from "node:path";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import {
  createAgentSessionRuntime,
  createAgentSessionFromServices,
  createAgentSessionServices,
  SessionManager,
  AuthStorage,
  ModelRegistry,
  stripFrontmatter,
  type CreateAgentSessionRuntimeFactory,
} from "@earendil-works/pi-coding-agent";
import { config, optional } from "config";
import { getTraceLogger, retainTraceSink } from "tracing";
import { getSupportedThinkingLevels } from "models";
import type { ThinkingLevel, ThinkingLevelMap } from "models";
import { SessionEventLog, type LoggedAguiEvent } from "./event-log";
import { buildReconnectPrelude } from "./reconnect-prelude";
import { compactReplayEvents } from "./replay-compaction";
import { AguiEventType as EventType, PiToAguiTranslator, type BaseEvent } from "./pi-to-agui-translator";
import { FILE_REFERENCE_PROMPT } from "./file-reference-prompt";
import { getAuthJsonPath, getModelsJsonPath } from "./models";
import { getExtensionPaths } from "./pi-packages";
import { getCodingAgentDir } from "./paths";
import { startSubagentCollector } from "./subagent-collector";
import { loadPrompts, getProjectPrompts, resolveProjectPrompt, type PromptSummary } from "./prompts";
import type {
  SubagentRunParams,
  SubagentDetails,
  SubagentRunResult,
} from "./subagent-bridge";
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
  project: string;
  /** Set for subagent sessions: id of the parent app session that dispatched them. */
  parentSessionId?: string;
  /** Set for subagent sessions: the parent tool call that dispatched them. */
  parentToolCallId?: string;
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

/**
 * Subagent sessions are reachable only through their parent: any accessor
 * must present the matching parentSessionId or the lookup fails closed.
 */
function assertSessionAccess(entry: SessionEntry, parentSessionId?: string): void {
  if (entry.parentSessionId && entry.parentSessionId !== parentSessionId) {
    throw new Error("Subagent session requires valid parent session id");
  }
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

/**
 * Apply a thinking level to a session. Pi clamps the level to the model's
 * capabilities (non-reasoning models → "off"), so an unsupported level is
 * never an error. No-op when no level is given.
 *
 * Side effect of Pi: setThinkingLevel also persists a global default in the
 * worker's settings.json. Harmless here, because every prompt carries the
 * level the UI is showing, which overwrites that global.
 */
export function applyThinkingLevel(
  session: { setThinkingLevel: (level: ThinkingLevel) => void },
  level: ThinkingLevel | undefined,
): void {
  if (!level) return;
  session.setThinkingLevel(level);
}

/**
 * Return the session's current thinking level and the levels the current
 * model supports; the UI reads it once to seed its control. Null when the
 * session does not exist (a session with no prompt sent yet), in which case
 * the UI falls back to the catalog default for the selected model. On a cold
 * worker restart the session is rehydrated from disk.
 */
export async function getSessionThinkingLevel(
  sessionId: string,
  project?: string,
): Promise<{ level: ThinkingLevel; levels: ThinkingLevel[] } | null> {
  const log = getTraceLogger("worker");
  let entry = sessions.get(sessionId);

  if (!entry && project) {
    log.info("session.thinking_level_load_disk", { sessionId });
    entry = await loadSessionFromDisk(sessionId, project);
  }

  if (!entry) {
    log.info("session.thinking_level_not_found", { sessionId });
    return null;
  }

  const session = entry.runtime.session;
  return {
    level: session.thinkingLevel,
    levels: session.getAvailableThinkingLevels(),
  };
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
 * Split a `provider/model-id` reference. Model ids may themselves contain
 * slashes (e.g. vercel-ai-gateway routes like "meta/muse-spark-1.2-contributor"
 * or openrouter ids), so only the first slash separates provider from model.
 */
function splitModelReference(
  modelId: string | undefined,
): { provider: string | undefined; model: string | undefined } {
  if (!modelId) return { provider: undefined, model: undefined };
  const slashIndex = modelId.indexOf("/");
  if (slashIndex === -1) return { provider: modelId, model: undefined };
  return {
    provider: modelId.slice(0, slashIndex),
    model: modelId.slice(slashIndex + 1),
  };
}

/**
 * Create the runtime factory reused for both new and reloaded sessions.
 */
function makeCreateRuntime(
  modelId?: string,
  options?: { includeSubagentExtension?: boolean },
): CreateAgentSessionRuntimeFactory {
  return async ({ cwd: runtimeCwd, sessionManager, sessionStartEvent }) => {
    const authStorage = AuthStorage.create(getAuthJsonPath());
    const services = await createAgentSessionServices({
      cwd: runtimeCwd,
      agentDir: getCodingAgentDir(),
      authStorage,
      modelRegistry: ModelRegistry.create(authStorage, getModelsJsonPath()),
      resourceLoaderOptions: {
        appendSystemPrompt: [FILE_REFERENCE_PROMPT],
        additionalExtensionPaths: getExtensionPaths({
          includeSubagentExtension: options?.includeSubagentExtension ?? true,
        }),
      },
    });
    const { provider: piProvider, model: piModelId } =
      splitModelReference(modelId);
    const model =
      piProvider && piModelId
          ? services.modelRegistry.find(piProvider, piModelId)
          : undefined;
    if (piProvider && piModelId && !model) {
      // The registry is authoritative; a missing entry means the session is
      // created without a model (Pi falls back to its default), which would
      // be a silent no-op for the caller. Surface it in the trace.
      getTraceLogger("worker").warn("session.model_not_in_registry", {
        modelId,
      });
    }
    const sessionResult = await createAgentSessionFromServices({
      services,
      sessionManager,
      sessionStartEvent,
      model,
    });
    // Pi only emits session_start/resources_discover when the host binds the
    // extension runtime. The harness has no TUI, but still needs the RPC-mode
    // lifecycle so extension-provided skills and bootstrap hooks are active.
    await sessionResult.session.bindExtensions({ mode: "rpc" });

    return {
      ...sessionResult,
      services,
      diagnostics: services.diagnostics,
    };
  };
}

/**
 * Load a session from disk by its session ID.
 * Returns the session entry if found and loaded, undefined otherwise.
 */
async function loadSessionFromDisk(
  sessionId: string,
  project: string,
  modelId?: string,
  options?: {
    /** Load from a subdirectory of the sessions dir (e.g. "subagents"). */
    sessionsSubdir?: string;
    /** Parent linkage for rehydrated subagent sessions (spec §4.5). */
    parentSessionId?: string;
    parentToolCallId?: string;
  },
): Promise<SessionEntry | undefined> {
  const log = getTraceLogger("worker");
  const sessionsDir = config.codingAgentSessionsDir();
  const projectsRoot = config.codingAgentProjectsRoot();
  const cwd = resolveProjectPath(projectsRoot, project);
  // A session rehydrated after a worker restart must surface its project's
  // prompts without waiting for a brand-new session (review Critical #1).
  // loadPrompts is idempotent per project, so this is a no-op once loaded.
  loadPrompts(cwd);
  const listDir = options?.sessionsSubdir
    ? path.join(sessionsDir, options.sessionsSubdir)
    : sessionsDir;

  log.info("session.load_disk_attempt", { sessionId });

  // Find the session file by listing sessions for the sessions dir
  const allSessions = await SessionManager.list(listDir);
  const found = allSessions.find((s) => s.id === sessionId);

  if (!found || !existsSync(found.path)) {
    log.warn("session.load_disk_not_found", { sessionId, sessionsChecked: allSessions.length });
    return undefined;
  }

  log.info("session.load_disk_found", { path: found.path });

  const sessionManager = SessionManager.open(found.path, listDir);
  const createRuntime = makeCreateRuntime(modelId, {
    includeSubagentExtension: !options?.parentSessionId,
  });

  const stop = log.startTimer("session.runtime_create");
  const runtime = await createAgentSessionRuntime(createRuntime, {
    cwd,
    agentDir: getCodingAgentDir(),
    sessionManager,
  });
  stop();

  const entry: SessionEntry = {
    sessionId,
    project,
    parentSessionId: options?.parentSessionId,
    parentToolCallId: options?.parentToolCallId,
    runtime,
    eventLog: new SessionEventLog(),
  };
  sessions.set(sessionId, entry);
  log.info("session.load_disk_done", { sessionId });
  return entry;
}

export interface GetOrCreateSessionOptions {
  userId: string;
  project: string;
  sessionId?: string;
  modelId?: string;
  thinkingLevel?: ThinkingLevel;
}

/**
 * The thinking level travels with every prompt (it only takes effect when a
 * turn runs), so it is applied on every path — in-memory reuse, disk reload
 * and create — not only when the model changes. Pi clamps it to the model.
 */
export async function getOrCreateSession(
  options: GetOrCreateSessionOptions,
): Promise<{ sessionId: string }> {
  const entry = await resolveSessionEntry(options);
  applyThinkingLevel(entry.runtime.session, options.thinkingLevel);
  return { sessionId: entry.sessionId };
}

async function resolveSessionEntry(
  options: GetOrCreateSessionOptions,
): Promise<SessionEntry> {
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
        // Pi's setModel has no isStreaming guard: swapping the model while a
        // run is in flight is undefined behavior. Refuse so the caller sees
        // the failure instead of a session whose model changed mid-turn.
        if (existing.runtime.session.isStreaming) {
          log.warn("session.model_change_blocked_streaming", {
            sessionId: existing.sessionId,
            modelId: options.modelId,
          });
          throw new Error("Cannot change model while the agent is running");
        }
        const { provider: piProvider, model: piModelId } =
          splitModelReference(options.modelId);
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
        } else {
          log.warn("session.model_not_in_registry", {
            sessionId: existing.sessionId,
            modelId: options.modelId,
          });
        }
      }
    }
    return existing;
  }

  // 2. Try to reload from disk if sessionId is provided (worker restarted)
  if (options.sessionId) {
    const loaded = await loadSessionFromDisk(
      options.sessionId,
      options.project,
      options.modelId,
    );
    if (loaded) return loaded;
  }

  // 3. Create a brand-new Pi SDK session
  const sessionId = options.sessionId ?? crypto.randomUUID();
  const projectsRoot = config.codingAgentProjectsRoot();
  const cwd = resolveProjectPath(projectsRoot, options.project);

  loadPrompts(cwd);

  log.info("session.create", {
    sessionId,
    project: options.project,
    modelId: options.modelId,
  });

  const sessionManager = SessionManager.create(
    config.codingAgentSessionsDir(),
    undefined,
    { id: sessionId },
  );
  const createRuntime = makeCreateRuntime(options.modelId);

  const stop = log.startTimer("session.runtime_create");
  const runtime = await createAgentSessionRuntime(createRuntime, {
    cwd,
    agentDir: getCodingAgentDir(),
    sessionManager,
  });
  stop();

  const entry: SessionEntry = {
    sessionId,
    project: options.project,
    runtime,
    eventLog: new SessionEventLog(),
  };
  sessions.set(sessionId, entry);
  return entry;
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
  const root = optional(() => config.codingAgentProjectsRoot());
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
    if (event.type === "message_update") {
      const ame = event.assistantMessageEvent as
        | { type?: string }
        | undefined;
      log.debug("pi.event", {
        type: event.type,
        deltaType: ame?.type,
      });
    } else {
      log.debug("pi.event", { type: event.type });
    }

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

  // The turn runs detached from the `sendPrompt` request: the browser can drop
  // the response (navigating to a subagent view, a reload) while the agent
  // keeps working for minutes. Hold the run's trace sink open for the turn's
  // real lifetime so everything it does afterwards — tool calls, subagent
  // dispatches, the terminal event — still lands in the trace.
  const releaseTurnSink = retainTraceSink(runId);

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
        } as BaseEvent);
      }
      unsubscribe();
      entry.activeRun = undefined;
      logCollectorSummary("error");
      await releaseTurnSink();
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

  const s = entry.runtime.session as unknown as {
    thinkingLevel?: string;
    model?: { id?: string; api?: string; reasoning?: boolean };
  };
  log.info("debug.agent_state", {
    sessionId,
    thinkingLevel: s.thinkingLevel,
    modelId: s.model?.id,
    api: s.model?.api,
    reasoning: s.model?.reasoning,
  });

  const loadedSkills = entry.runtime.services?.resourceLoader?.getSkills().skills ?? [];
  log.info("debug.skills_state", {
    sessionId,
    skillCount: loadedSkills.length,
    skillPaths: loadedSkills.map((skill) => skill.filePath),
  });

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
 * Return all messages in a session.
 * If the session is not in the in-memory Map,
 * attempts to load the session from disk first.
 */
export async function getSessionMessages(
  sessionId: string,
  project?: string,
  parentSessionId?: string,
): Promise<Array<any>> {
  const log = getTraceLogger("worker");
  let entry = sessions.get(sessionId);

  // If not in memory, try reloading from disk.
  // A presented parentSessionId marks the target as a subagent session,
  // which lives under the subagents/ subdir and is rehydrated with its
  // parent linkage so the access guard below holds on the cold path too.
  if (!entry && project) {
    log.info("session.messages_load_disk", { sessionId });
    const loaded = await loadSessionFromDisk(
      sessionId,
      project,
      undefined,
      parentSessionId ? { sessionsSubdir: "subagents", parentSessionId } : undefined,
    );
    if (loaded) {
      entry = loaded;
    }
  }

  if (!entry) {
    log.info("session.messages_not_found", { sessionId });
    return [];
  }

  assertSessionAccess(entry, parentSessionId);
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
 * Resolve the project cwd backing a session, or throw when the session is
 * not registered in this worker. The catalog is keyed per project (immutable
 * once loaded), so sessions in different projects never leak into each
 * other, and a session rehydrated after a worker restart still sees its
 * project's prompts.
 */
function sessionProjectCwd(sessionId: string): string {
  const entry = sessions.get(sessionId);
  if (!entry) throw new Error("Session not found");
  const cwd = sessionCwd(entry);
  if (!cwd) throw new Error("Session not found");
  return cwd;
}

export function getSessionPrompts(sessionId: string): PromptSummary[] {
  return getProjectPrompts(sessionProjectCwd(sessionId));
}

export function resolvePrompt(
  sessionId: string,
  promptName: string,
  values: Record<string, string>,
): { text: string } {
  return resolveProjectPrompt(sessionProjectCwd(sessionId), promptName, values);
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
  Array<{ providerId: string; modelId: string; label: string; levels: ThinkingLevel[] }>
> {
  const log = getTraceLogger("worker");
  log.info("models.fetch");

  const authStorage = AuthStorage.create(getAuthJsonPath());
  const registry = ModelRegistry.create(authStorage, getModelsJsonPath());
  const available = registry.getAvailable();
  const filtered = available
    .map((model) => ({
      providerId: model.provider,
      modelId: model.id,
      label: `${model.provider}/${model.id}`,
      levels: getSupportedThinkingLevels(
        model.reasoning,
        (model as { thinkingLevelMap?: ThinkingLevelMap }).thinkingLevelMap,
      ),
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
  project?: string,
): Promise<{ providerId: string; modelId: string } | null> {
  const log = getTraceLogger("worker");
  let entry = sessions.get(sessionId);

  if (!entry && project) {
    log.info("session.model_load_disk", { sessionId });
    entry = await loadSessionFromDisk(sessionId, project);
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
  // Subagent sessions dispatched by this session go down with it (spec §4.4);
  // their files on disk are kept.
  const childIds = [...sessions.values()]
    .filter((candidate) => candidate.parentSessionId === sessionId)
    .map((candidate) => candidate.sessionId);
  for (const childId of childIds) {
    const child = sessions.get(childId);
    if (!child) continue;
    log.info("session.dispose_child", { sessionId: childId, parentSessionId: sessionId });
    child.runtime.session.dispose();
    sessions.delete(childId);
  }
}

export interface SessionStatus {
  running: boolean;
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

export async function getSessionStatus(sessionId: string, parentSessionId?: string): Promise<SessionStatus> {
  const log = getTraceLogger("worker");
  const entry = sessions.get(sessionId);
  if (!entry) {
    log.info("session.status_not_found", { sessionId });
    return { running: false };
  }
  assertSessionAccess(entry, parentSessionId);
  if (entry.runtime.session.isStreaming) {
    return { running: true };
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
  project?: string,
  parentSessionId?: string,
): Promise<SessionSnapshot> {
  const messages = await getSessionMessages(sessionId, project, parentSessionId);
  const entry = sessions.get(sessionId);
  if (!entry) {
    return { messages, cursor: null, running: false };
  }
  assertSessionAccess(entry, parentSessionId);

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
  parentSessionId?: string,
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
  assertSessionAccess(entry, parentSessionId);

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

// Defined in subagent-bridge so the Pi extension can type against them
// without importing this module (see subagent-bridge for why that matters).
export type {
  SubagentRunParams,
  SubagentDetails,
  SubagentRunResult,
} from "./subagent-bridge";

/**
 * Resolve the child cwd: the `cwd` param when given, else the parent's cwd.
 * A given param must resolve to an existing directory inside the project
 * root — a worktree at `<project>/.worktrees/<name>` is valid; anything
 * outside the project or missing is rejected so the model can retry (D7).
 */
export function resolveSubagentCwd(
  projectCwd: string,
  cwdParam?: string,
): { ok: true; cwd: string } | { ok: false; error: string } {
  if (!cwdParam) return { ok: true, cwd: projectCwd };
  const resolved = path.resolve(projectCwd, cwdParam);
  const rel = path.relative(projectCwd, resolved);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: false, error: `cwd must resolve inside the project root: ${cwdParam}` };
  }
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    return { ok: false, error: `cwd is not an existing directory: ${cwdParam}` };
  }
  return { ok: true, cwd: resolved };
}

/**
 * Resolve the child model: strict match of the `model` param against the
 * available `provider/model-id` labels, else inherit the parent's model.
 * No match → error carrying the full list so the model can retry (D4).
 */
export function resolveSubagentModelId(
  parentModel: { provider: string; id: string } | undefined,
  available: string[],
  modelParam?: string,
): { ok: true; modelId?: string } | { ok: false; error: string } {
  if (!modelParam) {
    return { ok: true, modelId: parentModel ? `${parentModel.provider}/${parentModel.id}` : undefined };
  }
  if (available.includes(modelParam)) return { ok: true, modelId: modelParam };
  return {
    ok: false,
    error: `Unknown model "${modelParam}". Available models: ${available.join(", ")}`,
  };
}

/**
 * Resolve `<SESSIONS_DIR>/subagents/`, creating it when it is missing. Pi
 * validates a session's stored working directory while it builds the runtime,
 * so a subagents dir that does not exist yet makes the very first dispatch of
 * a fresh install fail with "Stored session working directory does not exist".
 */
export function ensureSubagentSessionsDir(sessionsDir: string): string {
  const dir = path.join(sessionsDir, "subagents");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function lastAssistantText(messages: ReadonlyArray<any>): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role !== "assistant") continue;
    if (typeof msg.content === "string") return msg.content;
    if (Array.isArray(msg.content)) {
      return msg.content
        .filter((c: any) => c?.type === "text")
        .map((c: any) => c.text ?? "")
        .join("\n");
    }
    return "";
  }
  return "";
}

/**
 * Dispatch a subagent: create a real Pi session (persisted under
 * `<SESSIONS_DIR>/subagents/`, runtime without the subagent extension),
 * register it in the sessions Map with its parent linkage, stream its
 * events into its own event log via the slim collector, and resolve with
 * the child's final assistant text plus the linkage details Pi persists
 * in the tool result (spec §4.2).
 */
export async function runSubagent(
  parentSessionId: string,
  toolCallId: string,
  params: SubagentRunParams,
  signal?: AbortSignal,
): Promise<SubagentRunResult> {
  const log = getTraceLogger("worker");
  const parent = sessions.get(parentSessionId);
  if (!parent) throw new Error(`Parent session not found for session ${parentSessionId}`);

  const failedDetails = (): SubagentDetails => ({
    // No session was created on validation failure, so no link should
    // resolve: getSubagentSessionForToolCall treats empty ids as not found.
    subSessionId: "",
    parentSessionId: parent.sessionId,
    parentToolCallId: toolCallId,
    description: params.description,
  });
  const errorResult = (error: string): SubagentRunResult => ({
    content: [{ type: "text", text: error }],
    details: failedDetails(),
    isError: true,
  });

  const projectsRoot = config.codingAgentProjectsRoot();
  const parentCwd = resolveProjectPath(projectsRoot, parent.project);

  const cwdResult = resolveSubagentCwd(parentCwd, params.cwd);
  if (!cwdResult.ok) return errorResult(cwdResult.error);

  const available = (await getAvailableModels()).map((m) => m.label);
  const modelResult = resolveSubagentModelId(parent.runtime.session.model, available, params.model);
  if (!modelResult.ok) return errorResult(modelResult.error);

  const subSessionId = crypto.randomUUID();
  const sessionManager = SessionManager.create(
    ensureSubagentSessionsDir(config.codingAgentSessionsDir()),
    undefined,
    { id: subSessionId },
  );
  const createRuntime = makeCreateRuntime(modelResult.modelId, { includeSubagentExtension: false });

  const stop = log.startTimer("subagent.runtime_create");
  const runtime = await createAgentSessionRuntime(createRuntime, {
    cwd: cwdResult.cwd,
    agentDir: getCodingAgentDir(),
    sessionManager,
  });
  stop();

  const entry: SessionEntry = {
    sessionId: subSessionId,
    project: parent.project,
    parentSessionId: parent.sessionId,
    parentToolCallId: toolCallId,
    runtime,
    eventLog: new SessionEventLog(),
  };
  sessions.set(subSessionId, entry);

  const runId = crypto.randomUUID();
  const stopCollector = startSubagentCollector(entry, runId);
  const onAbort = () => { void runtime.session.abort(); };
  signal?.addEventListener("abort", onAbort, { once: true });

  log.info("subagent.dispatch", {
    subSessionId,
    parentSessionId: parent.sessionId,
    parentToolCallId: toolCallId,
    cwd: cwdResult.cwd,
    modelId: modelResult.modelId,
  });

  const makeDetails = (): SubagentDetails => ({
    subSessionId,
    parentSessionId: parent.sessionId,
    parentToolCallId: toolCallId,
    description: params.description,
  });

  try {
    await runtime.session.prompt(params.task);
    const text = lastAssistantText(runtime.session.messages);
    return {
      content: [{ type: "text", text: signal?.aborted ? `[aborted] ${text}` : text || "(subagent produced no text output)" }],
      details: makeDetails(),
    };
  } catch (err) {
    log.error("subagent.failed", { subSessionId, error: String(err) });
    return {
      content: [{ type: "text", text: `Subagent failed: ${String(err)}` }],
      details: makeDetails(),
      isError: true,
    };
  } finally {
    signal?.removeEventListener("abort", onAbort);
    stopCollector();
    // The entry stays in the sessions Map: the dedicated view needs it alive
    // for snapshot/stream (spec §4.2.7). disposeSession(parent) reaps it.
  }
}

/**
 * Resolve the subagent session dispatched by a given parent tool call
 * (spec §4.5):
 * 1. Memory: a registered entry with matching parent linkage.
 * 2. Cold (after a worker restart): find the persisted toolResult in the
 *    parent's messages, read its `details.subSessionId`,
 *    rehydrate the child from `<SESSIONS_DIR>/subagents/` and register it.
 * 3. Otherwise throw — unknown toolCallId, validation-failure results
 *    (empty ids) or a missing session file all land here.
 */
export async function getSubagentSessionForToolCall(
  parentSessionId: string,
  toolCallId: string,
): Promise<{ subSessionId: string }> {
  const log = getTraceLogger("worker");
  const parent = sessions.get(parentSessionId);
  if (!parent) {
    log.info("subagent.lookup_parent_not_found", { parentSessionId, toolCallId });
    throw new Error("Parent session not found");
  }

  const registered = [...sessions.values()].find(
    (e) => e.parentSessionId === parentSessionId && e.parentToolCallId === toolCallId,
  );
  if (registered) {
    return { subSessionId: registered.sessionId };
  }

  const toolResult = (parent.runtime.session.messages as ReadonlyArray<any>).find(
    (msg) => msg?.role === "toolResult" && msg.toolCallId === toolCallId,
  );
  const subSessionId = toolResult?.details?.subSessionId;
  if (typeof subSessionId !== "string" || !subSessionId) {
    log.info("subagent.lookup_not_found", { parentSessionId, toolCallId });
    throw new Error("Subagent session not found for tool call");
  }

  const rehydrated = await loadSessionFromDisk(
    subSessionId,
    parent.project,
    undefined,
    {
      sessionsSubdir: "subagents",
      parentSessionId,
      parentToolCallId: toolCallId,
    },
  );
  if (!rehydrated) {
    log.info("subagent.lookup_rehydrate_failed", { parentSessionId, toolCallId, subSessionId });
    throw new Error("Subagent session not found for tool call");
  }
  return { subSessionId: rehydrated.sessionId };
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
