import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { WorkerClient } from "@/lib/features/code/worker-client";
import { getSession } from "@/lib/features/code/session-store";

function getSessionIdFromUrl(url: URL): string {
  const parts = url.pathname.split("/");
  // /api/agent/code/sessions/[sessionId]/thinking-level
  return decodeURIComponent(parts[parts.length - 2] ?? "");
}

/**
 * Read-only: the level is set by the run route, which receives it with the
 * prompt. This is only how the UI seeds its control with the level a session
 * already ran with; `thinking: null` means the worker has no session yet and
 * the UI keeps the catalog default for the selected model.
 */
export const GET = withAuth(async (user, req) => {
  const sessionId = getSessionIdFromUrl(new URL(req.url));
  const dbSession = await getSession({ userId: user.id, sessionId });
  if (!dbSession) {
    return Response.json({ thinking: null }, { status: 404 });
  }

  const client = new WorkerClient();
  const thinking = await client.getSessionThinkingLevel({
    sessionId,
    project: dbSession.project,
  });
  return Response.json(thinking);
});
