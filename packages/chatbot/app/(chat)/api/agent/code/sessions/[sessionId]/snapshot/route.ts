import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { WorkerClient } from "@/lib/features/code/worker-client";
import { getSession, touchSession } from "@/lib/features/code/session-store";

function getSessionIdFromUrl(url: URL): string {
  const parts = url.pathname.split("/");
  // /api/agent/code/sessions/[sessionId]/snapshot
  return decodeURIComponent(parts[parts.length - 2] ?? "");
}

/**
 * The worker owns both the rendered message snapshot and its resume cursor.
 * The BFF only authorizes access and supplies the persisted Pi-session link.
 */
export const GET = withAuth(async (user, req) => {
  const url = new URL(req.url);
  const sessionId = getSessionIdFromUrl(url);
  const dbSession = await getSession({ userId: user.id, sessionId });
  const client = new WorkerClient();

  // Subagent sub-sessions never get a DB row (spec §4.4): they are served
  // when the caller presents the parentSessionId the worker guard requires.
  if (!dbSession) {
    const parentSessionId = url.searchParams.get("parentSessionId");
    if (!parentSessionId) {
      return new Response("Session not found", { status: 404 });
    }
    const snapshot = await client.getSessionSnapshot({
      sessionId,
      piSessionId: url.searchParams.get("pi") ?? undefined,
      project: url.searchParams.get("project") ?? undefined,
      parentSessionId,
    });
    return Response.json(snapshot);
  }

  const snapshot = await client.getSessionSnapshot({
    sessionId,
    piSessionId: dbSession.piSessionId ?? undefined,
    project: dbSession.project,
  });
  await touchSession({ userId: user.id, sessionId });
  return Response.json(snapshot);
});
