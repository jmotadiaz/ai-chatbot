import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { WorkerClient } from "@/lib/features/code/worker-client";
import { getSession } from "@/lib/features/code/session-store";

/**
 * Discard the pending queued message without executing it. Base of the
 * chip's edit (clear + draft back to the textarea) and delete (clear +
 * discard) actions. Clearing is idempotent: an empty queue succeeds with
 * empty lists. The chip itself clears when the worker's queue-update event
 * arrives over the already-open run stream, not from this response.
 */
export const POST = withAuth(async (user, req) => {
  const { sessionId } = (await req.json()) as {
    sessionId?: unknown;
  };
  if (typeof sessionId !== "string") {
    return new Response("sessionId is required", { status: 400 });
  }
  const dbSession = await getSession({ userId: user.id, sessionId });
  if (!dbSession) {
    return new Response("Session not found", { status: 404 });
  }
  const client = new WorkerClient();
  const result = await client.clearQueue({
    sessionId,
    _traceRunId: crypto.randomUUID(),
  });
  return Response.json(result);
});
