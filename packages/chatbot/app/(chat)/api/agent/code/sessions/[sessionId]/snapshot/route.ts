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
  const sessionId = getSessionIdFromUrl(new URL(req.url));
  const dbSession = await getSession({ userId: user.id, sessionId });
  if (!dbSession) {
    return new Response("Session not found", { status: 404 });
  }

  const client = new WorkerClient();
  const snapshot = await client.getSessionSnapshot({
    sessionId,
    piSessionId: dbSession.piSessionId ?? undefined,
    project: dbSession.project,
  });
  await touchSession({ userId: user.id, sessionId });
  return Response.json(snapshot);
});
