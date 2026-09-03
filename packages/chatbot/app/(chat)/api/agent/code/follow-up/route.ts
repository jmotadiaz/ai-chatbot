import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { WorkerClient } from "@/lib/features/code/worker-client";
import { getSession } from "@/lib/features/code/session-store";

/**
 * Enqueue a plain-text follow-up on the active turn. Unlike the main
 * `/api/agent/code` route this never opens a run: it calls the worker's
 * `followUp` RPC, which queues the text for end-of-turn delivery. The
 * pending chip is driven by the worker's queue-update event arriving over
 * the already-open run stream, not by this response.
 */
export const POST = withAuth(async (user, req) => {
  const { sessionId, text } = (await req.json()) as {
    sessionId?: unknown;
    text?: unknown;
  };
  if (typeof sessionId !== "string" || typeof text !== "string" || text.trim().length === 0) {
    return new Response("sessionId and non-empty text are required", {
      status: 400,
    });
  }
  const dbSession = await getSession({ userId: user.id, sessionId });
  if (!dbSession) {
    return new Response("Session not found", { status: 404 });
  }
  const client = new WorkerClient();
  const result = await client.followUp({
    sessionId,
    text,
    _traceRunId: crypto.randomUUID(),
  });
  return Response.json(result);
});
