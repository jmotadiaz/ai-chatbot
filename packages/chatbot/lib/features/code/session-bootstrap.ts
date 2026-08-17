import "server-only";
import { toChatModelId, type ThinkingLevel } from "models";
import { getTraceLogger } from "tracing";
import {
  getSession,
  listSessions,
  touchSession,
} from "@/lib/features/code/session-store";
import {
  WorkerClient,
  type WorkerSessionSnapshot,
} from "@/lib/features/code/worker-client";
import type {
  CodingAgentBootstrap,
  SessionSnapshot,
} from "@/lib/features/code/types";

type DbSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

export const EMPTY_BOOTSTRAP: CodingAgentBootstrap = {
  snapshot: null,
  modelId: null,
  thinking: null,
  skills: null,
  prompts: null,
  promptSessions: null,
};

/** Run a bootstrap fetch, degrading to null (fetch on the client) on failure. */
async function optional<T>(
  what: string,
  sessionId: string,
  load: () => Promise<T>,
): Promise<T | null> {
  try {
    return await load();
  } catch (err) {
    getTraceLogger("bridge").warn("page.bootstrap_degraded", {
      sessionId,
      what,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function fetchSnapshot(
  client: WorkerClient,
  dbSession: DbSession,
): Promise<WorkerSessionSnapshot> {
  return client.getSessionSnapshot({
    sessionId: dbSession.sessionId,
    project: dbSession.project,
  });
}

export interface LoadCodingAgentSnapshotArgs {
  userId: string;
  sessionId: string;
  /** Set for subagent sub-sessions: the parent app session id (access guard). */
  parentSessionId?: string;
  /** Set for subagent sub-sessions, which have no DB row to read it from. */
  project?: string;
}

export type LoadCodingAgentSnapshotResult =
  | { ok: true; snapshot: WorkerSessionSnapshot }
  | { ok: false; reason: "not-found" };

/**
 * Authorize a coding-agent session and fetch its snapshot from the worker.
 *
 * The worker owns both the rendered message snapshot and its resume cursor
 * (`getSessionSnapshot` returns them as one atomic tuple); this only decides
 * who is allowed to ask. Shared by the `/snapshot` BFF route and the session
 * page's server render so both go through the very same authorization and the
 * very same RPC — SSR adds a second *caller*, never a second source of truth.
 */
export async function loadCodingAgentSnapshot({
  userId,
  sessionId,
  parentSessionId,
  project,
}: LoadCodingAgentSnapshotArgs): Promise<LoadCodingAgentSnapshotResult> {
  const dbSession = await getSession({ userId, sessionId });
  const client = new WorkerClient();

  // Subagent sub-sessions never get a DB row (spec §4.4): they are served
  // when the caller presents the parentSessionId the worker guard requires.
  if (!dbSession) {
    if (!parentSessionId) return { ok: false, reason: "not-found" };
    const snapshot = await client.getSessionSnapshot({
      sessionId,
      project,
      parentSessionId,
    });
    return { ok: true, snapshot };
  }

  const snapshot = await fetchSnapshot(client, dbSession);
  await touchSession({ userId, sessionId });
  return { ok: true, snapshot };
}

/**
 * Load the whole opening state of a session for the server render.
 *
 * The browser used to discover this in three waves: the snapshot, then the
 * model, then skills and prompts (which the UI holds back until the snapshot
 * lands). Here the same calls run against the worker over the local network,
 * and only the first wave is sequential — fetching the snapshot rehydrates the
 * session in the worker, so everything after it is an in-memory lookup and can
 * go in parallel.
 *
 * Each piece is fetched through `optional`, so a single failing RPC costs that
 * one field, not the page.
 */
export async function loadCodingAgentBootstrap(params: {
  userId: string;
  sessionId: string;
}): Promise<CodingAgentBootstrap> {
  const { userId, sessionId } = params;
  const dbSession = await getSession({ userId, sessionId });
  if (!dbSession) return EMPTY_BOOTSTRAP;

  const client = new WorkerClient();
  const project = dbSession.project;

  const snapshot = await optional("snapshot", sessionId, () =>
    fetchSnapshot(client, dbSession),
  );

  const [modelId, thinking, skills, promptsAndSessions] = await Promise.all([
    // The Pi session is the authority on the model; the DB value is only what
    // the session was created with, used until the worker has material.
    optional("model", sessionId, async () => {
      const { model } = await client.getSessionModel({
        sessionId,
        project,
      });
      return (
        (model ? toChatModelId(model.providerId, model.modelId) : undefined) ??
        dbSession.modelId ??
        null
      );
    }),
    optional("thinking", sessionId, async () => {
      const { thinking: loaded } = await client.getSessionThinkingLevel({
        sessionId,
        project,
      });
      return { level: (loaded?.level as ThinkingLevel | undefined) ?? null };
    }),
    optional("skills", sessionId, async () => {
      const { skills: loaded } = await client.getSessionSkills({ sessionId });
      return loaded;
    }),
    optional("prompts", sessionId, async () => {
      const { prompts } = await client.getSessionPrompts({ sessionId });
      const sessions = await listSessions({ userId, project });
      return {
        prompts,
        sessions: sessions.map((s) => ({
          sessionId: s.sessionId,
          label: s.label,
        })),
      };
    }),
  ]);

  // Recording the visit must never be the reason a page fails to render.
  await optional("touch", sessionId, () => touchSession({ userId, sessionId }));

  return {
    // The worker types its messages loosely (`role: string`); this is the same
    // unchecked boundary cast the client makes on the /snapshot response.
    snapshot: (snapshot as SessionSnapshot | null) ?? null,
    modelId: modelId ?? null,
    thinking,
    skills,
    prompts: promptsAndSessions?.prompts ?? null,
    promptSessions: promptsAndSessions?.sessions ?? null,
  };
}
