"use server";

import {
  FileTraceSink,
  isTracingEnabled,
  runWithTraceContext,
  getTraceLogger,
} from "tracing";
import { getDefaultThinkingLevel, toChatModelId, toPiModelId } from "models";
import type { InvocableModelId, ThinkingLevel } from "models";
import { config, optional } from "config";
import { listProjects } from "./project-resolver";
import {
  createSession,
  deleteSession,
  getSession,
  listSessions,
  updateSessionLabel,
} from "./session-store";
import { WorkerClient } from "./worker-client";
import { parseLeadingSkillCommands } from "./skill-commands";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import { auth } from "@/lib/features/auth/auth-config";

function assertEnabled() {
  if (!config.codingAgentEnabled()) {
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
    if (process.env.NEXT_PUBLIC_ENV === "test" || config.nodeEnv() === "test") {
      log.info("action.result", { count: 1, mocked: true });
      return ["ai-chatbot"];
    }
    const root = optional(() => config.codingAgentProjectsRoot());
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

export async function createCodingAgentSession(
  project: string,
  modelId?: string,
  initialPrompt?: string,
) {
  return withActionTrace("createCodingAgentSession", async (log) => {
    assertEnabled();
    const userId = await getUserId();
    const result = await createSession({
      userId,
      project,
      modelId: modelId || undefined,
    });
    log.info("action.result", { sessionId: result.sessionId });

    if (initialPrompt) {
      try {
        await startInitialRun({
          userId,
          project,
          sessionId: result.sessionId,
          modelId,
          initialPrompt,
          log,
        });
      } catch (err) {
        await deleteSession({ userId, sessionId: result.sessionId });
        throw err;
      }
    }

    return result;
  });
}

/**
 * A session created from the Markdown button carries its first prompt in the
 * same request: the worker starts the first turn detached (events land in the
 * session event log) before the client ever connects, so navigating to the
 * session later just reconnects and replays like any open session.
 */
async function startInitialRun(args: {
  userId: string;
  project: string;
  sessionId: string;
  modelId?: string;
  initialPrompt: string;
  log: ReturnType<typeof getTraceLogger>;
}) {
  const { userId, project, sessionId, modelId, initialPrompt, log } = args;
  const runId = crypto.randomUUID();
  const client = new WorkerClient();

  const piModelId = modelId ? toPiModelId(modelId as chatModelId) : undefined;
  const modelRef = piModelId
    ? `${piModelId.providerId}/${piModelId.modelId}`
    : undefined;
  const thinkingLevel = modelId
    ? getDefaultThinkingLevel(modelId as chatModelId)
    : undefined;

  await client.initializeSession({
    userId,
    sessionId,
    project,
    modelId: modelRef,
    thinkingLevel,
    _traceRunId: runId,
  });

  const stream = await client.sendPrompt({
    sessionId,
    prompt: initialPrompt,
    _traceRunId: runId,
  });
  // The turn is detached from this request: closing the relay stream must not
  // abort it. The worker retains the run sink and keeps logging to the event
  // log, which is what a later reconnect replays.
  await stream.cancel().catch(() => {});

  const label = parseLeadingSkillCommands(initialPrompt).text
    .trim()
    .split("\n")[0]
    ?.slice(0, 80);
  if (label) {
    await updateSessionLabel({ userId, sessionId, label });
  }
  log.info("initial_run_started", { sessionId, modelRef, runId });
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
}): Promise<{ subSessionId: string } | { error: string }> {
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

export interface CodingAgentModel {
  id: InvocableModelId;
  /** Niveles de razonamiento del modelo, según el registry de Pi en el worker. */
  levels: ThinkingLevel[];
  /** Nivel que se aplica al elegir este modelo, del catálogo. */
  defaultLevel: ThinkingLevel | undefined;
}

/**
 * Modelos disponibles con todo lo que la UI necesita saber de razonamiento.
 * Los niveles solo los conoce el worker (el `thinkingLevelMap` vive en el
 * registry de Pi, no en el catálogo), así que este es el único canal.
 */
export async function getCodingAgentModels(): Promise<CodingAgentModel[]> {
  return withActionTrace("getCodingAgentModels", async (log) => {
    assertEnabled();
    const client = new WorkerClient();
    const { models } = await client.getAvailableModels();
    const result = models
      .map((model) => ({ model, id: toChatModelId(model.providerId, model.modelId) }))
      .filter(
        (entry): entry is { model: (typeof models)[number]; id: InvocableModelId } =>
          entry.id !== undefined,
      )
      .map(({ model, id }) => ({
        id,
        levels: model.levels,
        defaultLevel: getDefaultThinkingLevel(id),
      }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    log.info("action.result", { count: result.length });
    return result;
  });
}
