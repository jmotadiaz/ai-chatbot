import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { WorkerClient } from "@/lib/features/code/worker-client";
import { getSession } from "@/lib/features/code/session-store";

function getSessionIdFromUrl(url: URL): string {
  const parts = url.pathname.split("/");
  return decodeURIComponent(parts[parts.length - 3] ?? "");
}

export const POST = withAuth(async (user, req) => {
  const sessionId = getSessionIdFromUrl(new URL(req.url));
  const dbSession = await getSession({ userId: user.id, sessionId });
  if (!dbSession) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const body = (await req.json()) as {
    promptName: string;
    values: Record<string, string>;
  };
  if (!body.promptName) {
    return Response.json({ error: "promptName is required" }, { status: 400 });
  }

  const client = new WorkerClient();
  await client.initializeSession({
    userId: user.id,
    sessionId,
    project: dbSession.project,
    piSessionId: dbSession.piSessionId ?? undefined,
  });

  try {
    const result = await client.resolvePrompt({
      sessionId,
      promptName: body.promptName,
      values: body.values ?? {},
    });
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 400 });
  }
});
