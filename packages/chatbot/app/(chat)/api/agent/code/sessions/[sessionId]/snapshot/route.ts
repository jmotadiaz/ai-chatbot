import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { loadCodingAgentSnapshot } from "@/lib/features/code/session-bootstrap";

function getSessionIdFromUrl(url: URL): string {
  const parts = url.pathname.split("/");
  // /api/agent/code/sessions/[sessionId]/snapshot
  return decodeURIComponent(parts[parts.length - 2] ?? "");
}

/**
 * The worker owns both the rendered message snapshot and its resume cursor.
 * The BFF only authorizes access and supplies the persisted Pi-session link —
 * see `loadCodingAgentSnapshot`, which the session page's server render calls
 * too. This route remains the client's recovery path (cursor reset, missing
 * cursor) even when the initial snapshot arrived with the SSR payload.
 */
export const GET = withAuth(async (user, req) => {
  const url = new URL(req.url);
  const sessionId = getSessionIdFromUrl(url);

  const result = await loadCodingAgentSnapshot({
    userId: user.id,
    sessionId,
    parentSessionId: url.searchParams.get("parentSessionId") ?? undefined,
    project: url.searchParams.get("project") ?? undefined,
  });

  if (!result.ok) {
    return new Response("Session not found", { status: 404 });
  }
  return Response.json(result.snapshot);
});
