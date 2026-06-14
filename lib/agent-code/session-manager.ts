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
  const existing = options.sessionId
    ? sessions.get(options.sessionId)
    : undefined;

  if (existing && existing.project === options.project) {
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

  const runtime = await createAgentSessionRuntime(createRuntime, {
    cwd,
    agentDir: getAgentDir(),
    sessionManager: SessionManager.create(process.env.CODING_AGENT_SESSIONS_DIR!),
  });

  sessions.set(sessionId, { sessionId, project: options.project, runtime });
  return { sessionId };
}

export async function sendPrompt(
  sessionId: string,
  prompt: string,
): Promise<ReadableStream<Uint8Array>> {
  const entry = sessions.get(sessionId);
  if (!entry) {
    throw new Error("Session not found");
  }

  const { runtime } = entry;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const unsubscribe = runtime.session.subscribe((event) => {
        const line = JSON.stringify(event) + "\n";
        controller.enqueue(encoder.encode(line));
      });

      runtime.session
        .prompt(prompt)
        .then(() => {
          controller.close();
          unsubscribe();
        })
        .catch((err) => {
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
  const authStorage = AuthStorage.create(process.env.CODING_AGENT_AUTH_JSON);
  const registry = ModelRegistry.create(authStorage);
  const available = await registry.getAvailable();
  return available
    .filter((model) => model.provider === "opencodeGo")
    .map((model) => ({
      providerId: model.provider,
      modelId: model.id,
      label: `${model.provider}/${model.id}`,
    }));
}

export async function disposeSession(sessionId: string): Promise<void> {
  const entry = sessions.get(sessionId);
  if (entry) {
    entry.runtime.session.dispose();
    sessions.delete(sessionId);
  }
}
