import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { WorkerClient } from "@/lib/features/code/worker-client";
import { getSession } from "@/lib/features/code/session-store";
import { toChatModelId } from "@/lib/features/code/model-mapping";

function getSessionIdFromUrl(url: URL): string {
  const parts = url.pathname.split("/");
  // /api/agent/code/sessions/[sessionId]/model
  return decodeURIComponent(parts[parts.length - 2] ?? "");
}

/**
 * The worker (Pi session) is the authority on which model a session uses.
 * The DB modelId is only the model the session was created with, used as a
 * fallback when the worker has no session material yet.
 */
export const GET = withAuth(async (user, req) => {
  const sessionId = getSessionIdFromUrl(new URL(req.url));
  const dbSession = await getSession({ userId: user.id, sessionId });
  if (!dbSession) {
    return new Response("Session not found", { status: 404 });
  }

  const client = new WorkerClient();
  const { model } = await client.getSessionModel({
    sessionId,
    piSessionId: dbSession.piSessionId ?? undefined,
    project: dbSession.project,
  });

  const modelId =
    (model ? toChatModelId(model.providerId, model.modelId) : undefined) ??
    dbSession.modelId ??
    null;
  return Response.json({ modelId });
});
