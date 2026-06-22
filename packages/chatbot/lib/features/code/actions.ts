"use server";

import {
  FileTraceSink,
  isTracingEnabled,
  runWithTraceContext,
  getTraceLogger,
} from "tracing";
import type { Message, ToolCall } from "@ag-ui/client";
import { listProjects } from "./project-resolver";
import {
  createSession,
  listSessions,
  getSession,
} from "./session-store";
import { filterAvailableChatModels } from "./model-mapping";
import { WorkerClient } from "./worker-client";
import { auth } from "@/lib/features/auth/auth-config";

function assertEnabled() {
  if (process.env.CODING_AGENT_ENABLED !== "true") {
    throw new Error("Coding agent is not enabled");
  }
}

async function getUserId() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return session.user.id;
}

async function withActionTrace<T>(
  action: string,
  fn: (log: ReturnType<typeof getTraceLogger>) => Promise<T>,
): Promise<T> {
  if (!isTracingEnabled()) {
    const noop = getTraceLogger("client");
    return fn(noop);
  }
  const runId = crypto.randomUUID();
  const sink = new FileTraceSink({ runId });
  await sink.open();
  try {
    return await runWithTraceContext({ runId, sink }, async () => {
      const log = getTraceLogger("client");
      log.info("action.call", { action });
      const stop = log.startTimer("action.duration");
      try {
        return await fn(log);
      } finally {
        stop();
      }
    });
  } finally {
    await sink.close();
  }
}

export async function getCodingAgentProjects() {
  return withActionTrace("getCodingAgentProjects", async (log) => {
    assertEnabled();
    if (process.env.NEXT_PUBLIC_ENV === "test" || process.env.NODE_ENV === "test") {
      log.info("action.result", { count: 1, mocked: true });
      return ["ai-chatbot"];
    }
    const root = process.env.CODING_AGENT_PROJECTS_ROOT;
    if (!root) return [];
    const result = await listProjects(root);
    log.info("action.result", { count: result.length });
    return result;
  });
}

export async function getCodingAgentSessions(project: string) {
  return withActionTrace("getCodingAgentSessions", async (log) => {
    assertEnabled();
    const userId = await getUserId();
    const result = await listSessions({ userId, project });
    log.info("action.result", { count: result.length });
    return result;
  });
}

export async function createCodingAgentSession(project: string, modelId?: string) {
  return withActionTrace("createCodingAgentSession", async (log) => {
    assertEnabled();
    const userId = await getUserId();
    const result = await createSession({ userId, project, modelId });
    log.info("action.result", { sessionId: result.sessionId });
    return result;
  });
}

export async function getCodingAgentSession(project: string, sessionId: string) {
  return withActionTrace("getCodingAgentSession", async (_log) => {
    assertEnabled();
    const userId = await getUserId();
    return await getSession({ userId, sessionId });
  });
}

export async function getCodingAgentModels() {
  return withActionTrace("getCodingAgentModels", async (log) => {
    assertEnabled();
    const client = new WorkerClient();
    const { models } = await client.getAvailableModels();
    const result = filterAvailableChatModels(models);
    log.info("action.result", { count: result.length });
    return result;
  });
}


export async function getCodingAgentStatus(sessionId: string): Promise<{ running: boolean; piSessionId?: string }> {
  return withActionTrace("getCodingAgentStatus", async (log) => {
    assertEnabled();
    try {
      const client = new WorkerClient();
      const status = await client.getSessionStatus({ sessionId });
      log.info("action.result", { running: status.running });
      return status;
    } catch {
      log.warn("action.failed_fetching_status");
      return { running: false };
    }
  });
}

export async function getCodingAgentMessages(project: string, sessionId: string): Promise<Message[]> {
  return withActionTrace("getCodingAgentMessages", async (log) => {
    assertEnabled();
    const userId = await getUserId();
    const dbSession = await getSession({ userId, sessionId });
    const client = new WorkerClient();
    try {
      const { messages } = await client.getSessionMessages({
        sessionId,
        piSessionId: dbSession?.piSessionId ?? undefined,
        project,
      });
      interface LoadedMessage {
        id?: string;
        role: string;
        content: string;
        toolCalls?: ToolCall[];
        toolCallId?: string;
      }
      const loaded: Message[] = ((messages ?? []) as unknown as LoadedMessage[]).map((m, i) => ({
        id: m.id || `loaded-${i}`,
        role: m.role as Message["role"],
        content: m.content,
        toolCalls: m.toolCalls,
        toolCallId: m.toolCallId,
      })) as Message[];
      log.info("action.result", { count: loaded.length });
      return loaded;
    } catch {
      // Worker unreachable or session gone → empty messages
      log.warn("action.failed_fetching_messages");
      return [];
    }
  });
}

