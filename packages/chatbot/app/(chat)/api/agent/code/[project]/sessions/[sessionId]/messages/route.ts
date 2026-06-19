import { NextResponse } from "next/server";
import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { WorkerClient } from "@/lib/features/code/worker-client";
import { getSession } from "@/lib/features/code/session-store";

function getParamsFromUrl(url: URL): { project: string; sessionId: string } {
  const parts = url.pathname.split("/");
  // /api/agent/code/[project]/sessions/[sessionId]/messages
  const sessionIdIdx = parts.length - 2; // "messages" is last, sessionId is before that
  return {
    project: decodeURIComponent(parts[parts.length - 4] ?? ""),
    sessionId: decodeURIComponent(parts[sessionIdIdx] ?? ""),
  };
}

export const GET = withAuth(async (user, req: Request) => {
  const { project, sessionId } = getParamsFromUrl(new URL(req.url));

  try {
    // Look up the piSessionId mapping from the DB so the worker can
    // reload the session from disk if it's not in memory.
    const dbSession = await getSession({ userId: user.id, sessionId });

    const client = new WorkerClient();
    const { messages } = await client.getSessionMessages({
      sessionId,
      piSessionId: dbSession?.piSessionId ?? undefined,
      project,
    });
    return NextResponse.json({ messages });
  } catch {
    // Worker unreachable or session gone → empty messages
    return NextResponse.json({ messages: [] });
  }
});
