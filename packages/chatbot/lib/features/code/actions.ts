"use server";

import {
  FileTraceSink,
  isTracingEnabled,
  runWithTraceContext,
  getTraceLogger,
} from "tracing";
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
import { fetchPublicModelCatalog } from "@/lib/infrastructure/ai/catalog";
import {
  getDefaultThinkingLevel,
  isKnownModelId,
} from "@/lib/features/foundation-model/config";
import type { ThinkingLevel } from "@/lib/features/foundation-model/config";
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
    if (config.environment() === "test") {
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

export async function getCodingAgentSessions(project: string, limit?: number) {
  return withActionTrace("getCodingAgentSessions", async (log) => {
    assertEnabled();
    const userId = await getUserId();
    const result = await listSessions({ userId, project, limit });
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

  // Single Gateway provider: the Pi id IS the catalog id, validated at runtime
  // against the snapshot (retired ids do not start a run).
  const catalog = await fetchPublicModelCatalog();
  const modelRef = isKnownModelId(catalog, modelId) ? modelId : undefined;
  const thinkingLevel = isKnownModelId(catalog, modelId)
    ? getDefaultThinkingLevel(catalog, modelId)
    : undefined;

  await client.initializeSession({
    userId,
    sessionId,
    project,
    modelId: modelRef,
    _traceRunId: runId,
  });

  const stream = await client.sendPrompt({
    sessionId,
    prompt: initialPrompt,
    modelId: modelRef,
    thinkingLevel,
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
  id: string;
  /** The model's reasoning levels, per the Gateway catalog synced in the worker. */
  levels: ThinkingLevel[];
  /** The level applied when this model is selected, from the catalog. */
  defaultLevel: ThinkingLevel | undefined;
}

/**
 * Available models with everything the UI needs to know about reasoning.
 * The Gateway's synced catalog lives in the worker (Pi sessions), and that is
 * where both the supported levels and the default come from
 * (`session-manager.ts`), so this is the only channel.
 *
 * With the single Gateway provider the Pi id is the catalog id: it is passed
 * through as-is and validated at runtime to derive the default level.
 */
export async function getCodingAgentModels(): Promise<CodingAgentModel[]> {
  return withActionTrace("getCodingAgentModels", async (log) => {
    assertEnabled();
    const client = new WorkerClient();
    const { models } = await client.getAvailableModels();
    const catalog = await fetchPublicModelCatalog();
    // The Gateway catalog dictates the order: iterate the catalog and look each
    // entry up in the worker response, skipping the unavailable ones. No local
    // `.sort()` — the order of the Gateway's `models` array is the source of
    // truth shared by the Model Picker and the chatbot.
    const workerById = new Map(models.map((model) => [model.modelId, model]));
    const result: CodingAgentModel[] = [];
    for (const entry of catalog) {
      const workerModel = workerById.get(entry.id);
      if (!workerModel) continue;
      result.push({
        id: workerModel.modelId,
        levels: workerModel.levels,
        defaultLevel: getDefaultThinkingLevel(catalog, workerModel.modelId),
      });
    }
    log.info("action.result", { count: result.length });
    return result;
  });
}
