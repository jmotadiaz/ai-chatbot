import "server-only";
import { getSession, touchSession } from "@/lib/features/code/session-store";
import {
  WorkerClient,
  type WorkerSessionSnapshot,
} from "@/lib/features/code/worker-client";

export interface LoadCodingAgentSnapshotArgs {
  userId: string;
  sessionId: string;
  /** Set for subagent sub-sessions: the parent app session id (access guard). */
  parentSessionId?: string;
  /** Set for subagent sub-sessions: the persisted Pi session id (cold reload). */
  piSessionId?: string;
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
 * who is allowed to ask and supplies the persisted Pi-session link. Shared by
 * the `/snapshot` BFF route and the session page's server render so both go
 * through the very same authorization and the very same RPC — SSR adds a
 * second *caller*, never a second source of truth.
 */
export async function loadCodingAgentSnapshot({
  userId,
  sessionId,
  parentSessionId,
  piSessionId,
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
      piSessionId,
      project,
      parentSessionId,
    });
    return { ok: true, snapshot };
  }

  const snapshot = await client.getSessionSnapshot({
    sessionId,
    piSessionId: dbSession.piSessionId ?? undefined,
    project: dbSession.project,
  });
  await touchSession({ userId, sessionId });
  return { ok: true, snapshot };
}
