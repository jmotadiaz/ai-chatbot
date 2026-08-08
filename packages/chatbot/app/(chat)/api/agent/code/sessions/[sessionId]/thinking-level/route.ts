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
    return Response.json({ thinking: null }, { status: 404 });
  }

  const client = new WorkerClient();
  const thinking = await client.getSessionThinkingLevel({
    sessionId,
    piSessionId: dbSession.piSessionId ?? undefined,
    project: dbSession.project,
  });
  return Response.json(thinking);
});

export const POST = withAuth(async (user, req) => {
  const sessionId = getSessionIdFromUrl(new URL(req.url));
  const dbSession = await getSession({ userId: user.id, sessionId });
  if (!dbSession) {
    return Response.json({ thinking: null }, { status: 404 });
  }

  const body = (await req.json()) as { level?: string };
  if (typeof body.level !== "string" || body.level.length === 0) {
    return Response.json({ error: "level is required" }, { status: 400 });
  }

  const client = new WorkerClient();
  const thinking = await client.setSessionThinkingLevel({
    sessionId,
    level: body.level,
    piSessionId: dbSession.piSessionId ?? undefined,
    project: dbSession.project,
  });
  return Response.json(thinking);
});
