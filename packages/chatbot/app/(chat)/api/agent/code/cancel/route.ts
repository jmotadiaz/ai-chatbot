import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { WorkerClient } from "@/lib/features/code/worker-client";
import { getSession } from "@/lib/features/code/session-store";

export const POST = withAuth(async (user, req) => {
  const { sessionId } = (await req.json()) as { sessionId: string };
  const dbSession = await getSession({ userId: user.id, sessionId });
  if (!dbSession) {
    return new Response("Session not found", { status: 404 });
  }
  const client = new WorkerClient();
  const result = await client.cancelRun({
    sessionId,
    _traceRunId: crypto.randomUUID(),
  });
  return Response.json(result);
});
