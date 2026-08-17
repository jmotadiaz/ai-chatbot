import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { WorkerClient } from "@/lib/features/code/worker-client";
import { getSession, listSessions } from "@/lib/features/code/session-store";

function getSessionIdFromUrl(url: URL): string {
  const parts = url.pathname.split("/");
  return decodeURIComponent(parts[parts.length - 2] ?? "");
}

export const GET = withAuth(async (user, req) => {
  const sessionId = getSessionIdFromUrl(new URL(req.url));
  const dbSession = await getSession({ userId: user.id, sessionId });
  if (!dbSession) {
    return Response.json({ prompts: [], sessions: [] }, { status: 404 });
  }

  const client = new WorkerClient();
  try {
    await client.initializeSession({
      userId: user.id,
      sessionId,
      project: dbSession.project,
    });
    const result = await client.getSessionPrompts({ sessionId });
    const sessions = await listSessions({
      userId: user.id,
      project: dbSession.project,
    });
    return Response.json({
      prompts: result.prompts,
      sessions: sessions.map((s) => ({ sessionId: s.sessionId, label: s.label })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 400 });
  }
});
