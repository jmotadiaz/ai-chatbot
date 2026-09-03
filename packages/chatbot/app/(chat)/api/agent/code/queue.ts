import { WorkerClient, workerErrorDetails } from "@/lib/features/code/worker-client";
import { getSession } from "@/lib/features/code/session-store";

/**
 * Shared plumbing for the queue routes (`follow-up`, `steer`,
 * `clear-queue`): session validation, session authorization and worker-error
 * mapping in one place so the three routes cannot drift apart.
 *
 * Worker failures surface with the worker's own message and the matching
 * HTTP status — 409 for the single-pending conflict (or a turn-state
 * mismatch), 400 for fail-fast validation, 404 for a missing session —
 * never wrapped in a generic line (US8/US18). The hook shows that message
 * in the banner and the caller keeps its draft.
 */
export async function handleQueuePost(
  req: Request,
  userId: string,
  options: {
    /** `follow-up`/`steer` require text; `clear-queue` does not take any. */
    requireText: boolean;
    call: (
      client: WorkerClient,
      sessionId: string,
      text: string,
    ) => Promise<unknown>;
  },
): Promise<Response> {
  const body = (await req.json()) as {
    sessionId?: unknown;
    text?: unknown;
  };
  if (typeof body.sessionId !== "string") {
    return new Response("sessionId is required", { status: 400 });
  }
  let text = "";
  if (options.requireText) {
    if (
      typeof body.text !== "string" ||
      body.text.trim().length === 0
    ) {
      return new Response("sessionId and non-empty text are required", {
        status: 400,
      });
    }
    text = body.text;
  }
  const dbSession = await getSession({ userId, sessionId: body.sessionId });
  if (!dbSession) {
    return new Response("Session not found", { status: 404 });
  }
  const client = new WorkerClient();
  try {
    const result = await options.call(client, body.sessionId, text);
    return Response.json(result);
  } catch (err) {
    return queueWorkerErrorResponse(err);
  }
}

/**
 * Map a worker failure to the matching HTTP status with the worker's own
 * message as the body, so the hook can surface it verbatim in the banner.
 */
export function queueWorkerErrorResponse(err: unknown): Response {
  const { code, message } = workerErrorDetails(err);
  if (code === 409 || /already pending|no turn is running/i.test(message)) {
    return new Response(message, { status: 409 });
  }
  if (/Session not found/.test(message)) {
    return new Response(message, { status: 404 });
  }
  if (
    /required|non-empty|plain text|cannot be queued|does not accept/i.test(
      message,
    )
  ) {
    return new Response(message, { status: 400 });
  }
  return new Response(message || "Worker request failed", { status: 500 });
}
