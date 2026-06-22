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
}

interface SessionEntry {
  sessionId: string;
  piSessionId: string;
  project: string;
  runtime: Awaited<ReturnType<typeof createAgentSessionRuntime>>;
  inFlightTools: Map<number, InFlightTool>;
  inFlightSteps: Map<string, string>;
}

const sessions = new Map<string, SessionEntry>();

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
    inFlightSteps: new Map(),
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
    inFlightSteps: new Map(),
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

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const unsubscribe = runtime.session.subscribe((event) => {
        log.debug("pi.event", { type: event.type });

        if (event.type === "message_update") {
          const ame = event.assistantMessageEvent as
            | { type: string; contentIndex?: number; toolCall?: { id?: string; name?: string }; delta?: string }
            | undefined;
          if (ame?.type === "toolcall_start" && typeof ame.contentIndex === "number") {
            const toolCallId = ame.toolCall?.id ?? `tool-${crypto.randomUUID()}`;
            const name = ame.toolCall?.name ?? "unknown";
            entry.inFlightTools.set(ame.contentIndex, {
              toolCallId,
              name,
              argsSoFar: "",
            });
          } else if (ame?.type === "toolcall_delta" && typeof ame.contentIndex === "number") {
            const t = entry.inFlightTools.get(ame.contentIndex);
            if (t) t.argsSoFar += ame.delta ?? "";
          } else if (ame?.type === "toolcall_end" && typeof ame.contentIndex === "number") {
          }
        } else if (event.type === "message_end") {
          entry.inFlightTools.clear();
          entry.inFlightSteps.clear();
        } else if (event.type === "tool_execution_start") {
          const id = (event as { toolCallId?: string }).toolCallId;
          const name = (event as { toolName?: string }).toolName;
          if (id && name) entry.inFlightSteps.set(id, `tool:${name}:${id}`);
        } else if (event.type === "tool_execution_end") {
          const id = (event as { toolCallId?: string }).toolCallId;
          if (id) entry.inFlightSteps.delete(id);
        }

        const line = JSON.stringify(event) + "\n";
        controller.enqueue(encoder.encode(line));
      });

      const promptStop = log.startTimer("session.prompt_execution");
      runtime.session
        .prompt(prompt)
        .then(() => {
          promptStop();
          log.info("session.prompt_complete", { sessionId });
          controller.close();
          unsubscribe();
        })
        .catch((err) => {
          promptStop();
          log.error("session.prompt_error", { sessionId, message: String(err) });
          controller.error(err);
          unsubscribe();
        });
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
    toolCallId: string;
    name: string;
    argsSoFar: string;
    parentMessageId?: string;
  }>;
}

export async function connectToSession(
  sessionId: string,
  onEvent: (line: string) => void,
  registerCleanup: (cleanup: () => void) => void,
): Promise<void> {
  const log = getTraceLogger("worker");
  const entry = sessions.get(sessionId);
  if (!entry) {
    log.info("connect.session_not_found", { sessionId });
    onEvent(JSON.stringify({ type: "snapshot", messages: [], inFlight: [] }) + "\n");
    onEvent(JSON.stringify({ type: "agent_end" }) + "\n");
    return;
  }

  const messages = await getSessionMessages(sessionId);
  const inFlight: ConnectSnapshot["inFlight"] = [];
  for (const [, tool] of Array.from(entry.inFlightTools.entries())) {
    inFlight.push({
      toolCallId: tool.toolCallId,
      name: tool.name,
      argsSoFar: tool.argsSoFar,
      parentMessageId: tool.parentMessageId,
    });
  }

  onEvent(
    JSON.stringify({ type: "snapshot", messages, inFlight }) + "\n",
  );

  const unsubscribe = entry.runtime.session.subscribe((event) => {
    onEvent(JSON.stringify(event) + "\n");
  });
  registerCleanup(() => {
    log.info("connect.client_disconnected", { sessionId });
    unsubscribe();
  });
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
