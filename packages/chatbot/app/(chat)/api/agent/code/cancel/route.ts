import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { WorkerClient } from "@/lib/features/code/worker-client";

export const POST = withAuth(async (user, req) => {
  const { sessionId } = (await req.json()) as { sessionId: string };
  const client = new WorkerClient();
  const result = await client.cancelRun({
    sessionId,
    _traceRunId: crypto.randomUUID(),
  });
  return Response.json(result);
});
