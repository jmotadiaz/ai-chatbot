import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { WorkerClient } from "@/lib/features/code/worker-client";
import { getSession } from "@/lib/features/code/session-store";

/**
 * Promote the pending follow-up to steering: the worker clears both queues
 * and re-enqueues the text as steering in one logical operation, so the
 * same text can never execute twice (end-of-turn AND next-request). Steering
 * never aborts running tools: it is delivered after the current assistant
 * turn, before the next LLM call, inside the active turn under the same
 * runId. The chip clears when the worker's queue-update event arrives over
 * the already-open run stream, not from this response.
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
  const result = await client.steer({
    sessionId,
    text,
    _traceRunId: crypto.randomUUID(),
  });
  return Response.json(result);
});
