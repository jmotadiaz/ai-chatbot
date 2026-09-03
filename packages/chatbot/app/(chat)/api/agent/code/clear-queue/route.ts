import { handleQueuePost } from "../queue";
import { withAuth } from "@/lib/features/auth/with-auth/handler";

/**
 * Discard the pending queued message without executing it. Base of the
 * chip's edit (clear + draft back to the textarea) and delete (clear +
 * discard) actions. Clearing is idempotent: an empty queue succeeds with
 * empty lists. The chip itself clears when the worker's queue-update event
 * arrives over the already-open run stream, not from this response.
 */
export const POST = withAuth(async (user, req) => {
  return handleQueuePost(req, user.id, {
    requireText: false,
    call: (client, sessionId) =>
      client.clearQueue({
        sessionId,
        _traceRunId: crypto.randomUUID(),
      }),
  });
});
