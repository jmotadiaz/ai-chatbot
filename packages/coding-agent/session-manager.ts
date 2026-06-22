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

interface InFlightTool {
  toolCallId: string;
  name: string;
  argsSoFar: string;
  parentMessageId?: string;
  callEnded: boolean;
}

interface SessionEntry {
  sessionId: string;
  piSessionId: string;
  project: string;
  runtime: Awaited<ReturnType<typeof createAgentSessionRuntime>>;
  inFlightTools: Map<number, InFlightTool>;
}

const sessions = new Map<string, SessionEntry>();

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
  });
  return { sessionId, piSessionId };
}

export async function sendPrompt(
  sessionId: string,
  prompt: string,
  messages?: Array<{ role: string; content: string }>,
): Promise<ReadableStream<Uint8Array>> {
  const log = getTraceLogger("worker");
  const entry = sessions.get(sessionId);
  if (!entry) {
    log.error("session.not_found", { sessionId });
    throw new Error("Session not found");
  }

  log.info("session.prompt", {
    sessionId,
    promptLength: prompt.length,
    historyMessageCount: messages?.length ?? 0,
  });
  const { runtime } = entry;
  const encoder = new TextEncoder();

  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      unsubscribe = runtime.session.subscribe((event) => {
        log.debug("pi.event", { type: event.type });

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

        const line = JSON.stringify(event) + "\n";
        try {
          controller.enqueue(encoder.encode(line));
        } catch (err) {
          log.warn("session.prompt_stream_enqueue_error", { sessionId, error: String(err) });
        }
      });

      const promptStop = log.startTimer("session.prompt_execution");
      runtime.session
        .prompt(prompt)
        .then(() => {
          promptStop();
          log.info("session.prompt_complete", { sessionId });
          controller.close();
          unsubscribe?.();
        })
        .catch((err) => {
          promptStop();
          log.error("session.prompt_error", { sessionId, message: String(err) });
          controller.error(err);
          unsubscribe?.();
        });
    },
    cancel() {
      log.info("session.prompt_stream_cancelled", { sessionId });
      unsubscribe?.();
    },
  });

  return stream;
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

export interface ConnectSnapshot {
  type: "snapshot";
  messages: Array<unknown>;
  inFlight: Array<{
    contentIndex: number;
    toolCallId: string;
    name: string;
    argsSoFar: string;
    parentMessageId?: string;
    callEnded: boolean;
  }>;
  isStreaming: boolean;
}

export async function connectToSession(
  sessionId: string,
  onEvent: (line: string) => void,
  onError: (err: Error) => void,
  onComplete?: () => void,
): Promise<() => void> {
  const log = getTraceLogger("worker");

  const emitAgentEnd = () => {
    onEvent(JSON.stringify({ type: "agent_end" }) + "\n");
  };

  const finishImmediately = () => {
    emitAgentEnd();
    onComplete?.();
    return () => {};
  };

  const entry = sessions.get(sessionId);
  if (!entry) {
    log.info("connect.session_not_found", { sessionId });
    onEvent(JSON.stringify({ type: "snapshot", messages: [], inFlight: [], isStreaming: false }) + "\n");
    return finishImmediately();
  }

  const messages = await getSessionMessages(sessionId);

  // Tool calls that are still in-flight will be replayed as live AG-UI events
  // (TOOL_CALL_START + TOOL_CALL_ARGS). If we left them in the snapshot's
  // assistant message, AG-UI would create duplicate toolCalls when the live
  // TOOL_CALL_START arrives. We remove them from the snapshot and carry their
  // parent message id in the inFlight metadata so the BFF can seed the
  // translator and emit TOOL_CALL_START with the correct parentMessageId.
  const inFlightToolIds = new Set<string>();
  for (const [, tool] of entry.inFlightTools) {
    inFlightToolIds.add(tool.toolCallId);
  }

  const toolParentMap = new Map<string, string>();
  for (const m of messages) {
    if (m.role === "assistant" && Array.isArray(m.toolCalls)) {
      const remaining = m.toolCalls.filter((tc: { id?: string }) => {
        if (tc.id && inFlightToolIds.has(tc.id)) {
          toolParentMap.set(tc.id, m.id);
          return false;
        }
        return true;
      });
      if (remaining.length === 0) {
        delete m.toolCalls;
      } else {
        m.toolCalls = remaining;
      }
    }
  }

  const inFlight: ConnectSnapshot["inFlight"] = [];
  for (const [contentIndex, tool] of entry.inFlightTools) {
    inFlight.push({
      contentIndex,
      toolCallId: tool.toolCallId,
      name: tool.name,
      argsSoFar: tool.argsSoFar,
      parentMessageId: toolParentMap.get(tool.toolCallId) ?? tool.parentMessageId,
      callEnded: tool.callEnded,
    });
  }

  log.info("connect.snapshot_built", {
    sessionId,
    messageCount: messages.length,
    inFlightCount: inFlight.length,
    inFlight: inFlight.map((t) => ({
      contentIndex: t.contentIndex,
      toolCallId: t.toolCallId,
      name: t.name,
      parentMessageId: t.parentMessageId,
      argsSoFarLength: t.argsSoFar.length,
    })),
    removedToolCallIds: Array.from(inFlightToolIds),
  });

  const isStreaming = entry.runtime.session.isStreaming;

  let closed = false;
  const eventBuffer: string[] = [];
  let buffering = true;
  let hadAgentEnd = false;

  const unsubscribe = entry.runtime.session.subscribe((event) => {
    if (closed) return;
    try {
      const line = JSON.stringify(event) + "\n";
      if (event.type === "agent_end") {
        hadAgentEnd = true;
      }
      if (buffering) {
        eventBuffer.push(line);
      } else {
        onEvent(line);
      }
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  });

  onEvent(
    JSON.stringify({ type: "snapshot", messages, inFlight, isStreaming }) + "\n",
  );

  const hasNoLiveActivity =
    !isStreaming && inFlight.length === 0 && eventBuffer.length === 0;

  if (hasNoLiveActivity) {
    log.info("connect.idle_completed", { sessionId });
    buffering = false;
    unsubscribe();
    return finishImmediately();
  }

  buffering = false;
  log.info("connect.draining_buffer", {
    sessionId,
    bufferedEventCount: eventBuffer.length,
  });
  for (const line of eventBuffer) {
    if (closed) break;
    onEvent(line);
  }
  eventBuffer.length = 0;

  if (closed) return () => {};
  if (!entry.runtime.session.isStreaming && entry.inFlightTools.size === 0) {
    log.info("connect.idle_after_drain", { sessionId });
    if (!hadAgentEnd) emitAgentEnd();
    onComplete?.();
    unsubscribe();
    return () => {};
  }

  return () => {
    if (closed) return;
    closed = true;
    log.info("connect.client_disconnected", { sessionId });
    unsubscribe();
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
