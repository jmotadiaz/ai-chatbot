import path from "node:path";
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
import { getTraceLogger } from "./tracing";

interface SessionEntry {
  sessionId: string;
  project: string;
  runtime: Awaited<ReturnType<typeof createAgentSessionRuntime>>;
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

export async function getOrCreateSession(options: {
  userId: string;
  project: string;
  sessionId?: string;
  modelId?: string;
}): Promise<{ sessionId: string }> {
  const log = getTraceLogger("worker");
  const existing = options.sessionId
    ? sessions.get(options.sessionId)
    : undefined;

  if (existing && existing.project === options.project) {
    log.info("session.reuse", { sessionId: existing.sessionId });
    if (options.modelId) {
      const model = existing.runtime.session.model;
      if (model && `${model.provider}/${model.id}` !== options.modelId) {
        // TODO: call setModel on the session if Pi SDK supports it
      }
    }
    return { sessionId: existing.sessionId };
  }

  const sessionId = options.sessionId ?? crypto.randomUUID();
  const projectsRoot = process.env.CODING_AGENT_PROJECTS_ROOT!;
  const cwd = resolveProjectPath(projectsRoot, options.project);

  log.info("session.create", { sessionId, project: options.project, modelId: options.modelId });

  const createRuntime: CreateAgentSessionRuntimeFactory = async ({
    cwd: runtimeCwd,
    sessionManager,
    sessionStartEvent,
  }) => {
    const services = await createAgentSessionServices({ cwd: runtimeCwd });
    return {
      ...(await createAgentSessionFromServices({
        services,
        sessionManager,
        sessionStartEvent,
      })),
      services,
      diagnostics: services.diagnostics,
    };
  };

  const stop = log.startTimer("session.runtime_create");
  const runtime = await createAgentSessionRuntime(createRuntime, {
    cwd,
    agentDir: getAgentDir(),
    sessionManager: SessionManager.create(process.env.CODING_AGENT_SESSIONS_DIR!),
  });
  stop();

  sessions.set(sessionId, { sessionId, project: options.project, runtime });
  return { sessionId };
}

export async function sendPrompt(
  sessionId: string,
  prompt: string,
): Promise<ReadableStream<Uint8Array>> {
  const log = getTraceLogger("worker");
  const entry = sessions.get(sessionId);
  if (!entry) {
    log.error("session.not_found", { sessionId });
    throw new Error("Session not found");
  }

  log.info("session.prompt", { sessionId, promptLength: prompt.length });
  const { runtime } = entry;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const unsubscribe = runtime.session.subscribe((event) => {
        log.debug("pi.event", { type: event.type });
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

export async function getAvailableModels(): Promise<
  Array<{ providerId: string; modelId: string; label: string }>
> {
  const log = getTraceLogger("worker");
  log.info("models.fetch");

  const authStorage = AuthStorage.create(process.env.CODING_AGENT_AUTH_JSON);
  const registry = ModelRegistry.create(authStorage);
  const available = await registry.getAvailable();
  const filtered = available
    .filter((model) => model.provider === "opencodeGo")
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
