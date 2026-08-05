import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { WorkerClient } from "@/lib/features/code/worker-client";
import { getSession } from "@/lib/features/code/session-store";

function getSessionIdFromUrl(url: URL): string {
  const parts = url.pathname.split("/");
  return decodeURIComponent(parts[parts.length - 2] ?? "");
}

export const GET = withAuth(async (user, req) => {
  const sessionId = getSessionIdFromUrl(new URL(req.url));
  const dbSession = await getSession({ userId: user.id, sessionId });
  if (!dbSession) {
    return Response.json({ prompts: [] }, { status: 404 });
  }

  const client = new WorkerClient();
  await client.initializeSession({
    userId: user.id,
    sessionId,
    project: dbSession.project,
    piSessionId: dbSession.piSessionId ?? undefined,
  });
  const result = await client.getSessionPrompts({ sessionId });
  return Response.json(result);
});
