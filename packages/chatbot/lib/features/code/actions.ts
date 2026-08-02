"use server";

import {
  FileTraceSink,
  isTracingEnabled,
  runWithTraceContext,
  getTraceLogger,
} from "tracing";
import { filterAvailableChatModels } from "models";
import { listProjects } from "./project-resolver";
import {
  createSession,
  listSessions,
  getSession,
} from "./session-store";
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

export async function getSubagentSessionAction(input: {
  parentSessionId: string;
  toolCallId: string;
}): Promise<{ subSessionId: string; subPiSessionId: string } | { error: string }> {
  return withActionTrace("getSubagentSession", async (log) => {
    try {
      assertEnabled();
      await getUserId();
      const client = new WorkerClient();
      const result = await client.getSubagentSession(input);
      log.info("action.result", { subSessionId: result.subSessionId });
      return result;
    } catch (err) {
      log.warn("action.error", { message: String(err) });
      return { error: err instanceof Error ? err.message : String(err) };
    }
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
