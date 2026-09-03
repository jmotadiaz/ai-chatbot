import { handleQueuePost } from "../queue";
import { withAuth } from "@/lib/features/auth/with-auth/handler";

/**
 * Enqueue a plain-text follow-up on the active turn. Unlike the main
 * `/api/agent/code` route this never opens a run: it calls the worker's
 * `followUp` RPC, which queues the text for end-of-turn delivery. The
 * pending chip is driven by the worker's queue-update event arriving over
 * the already-open run stream, not by this response.
 */
export const POST = withAuth(async (user, req) => {
  return handleQueuePost(req, user.id, {
    requireText: true,
    call: (client, sessionId, text) =>
      client.followUp({
        sessionId,
        text,
        _traceRunId: crypto.randomUUID(),
      }),
  });
});
