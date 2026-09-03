import { handleQueuePost } from "../queue";
import { withAuth } from "@/lib/features/auth/with-auth/handler";

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
  return handleQueuePost(req, user.id, {
    requireText: true,
    call: (client, sessionId, text) =>
      client.steer({
        sessionId,
        text,
        _traceRunId: crypto.randomUUID(),
      }),
  });
});
