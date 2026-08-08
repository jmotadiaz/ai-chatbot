import type { ThinkingLevel } from "models";
import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { WorkerClient } from "@/lib/features/code/worker-client";
import { getSession } from "@/lib/features/code/session-store";

const THINKING_LEVELS: readonly ThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return (
    typeof value === "string" &&
    (THINKING_LEVELS as readonly string[]).includes(value)
  );
}

function getSessionIdFromUrl(url: URL): string {
  const parts = url.pathname.split("/");
  return decodeURIComponent(parts[parts.length - 2] ?? "");
}

export const GET = withAuth(async (user, req) => {
  const sessionId = getSessionIdFromUrl(new URL(req.url));
  const dbSession = await getSession({ userId: user.id, sessionId });
  if (!dbSession) {
    return Response.json({ thinking: null }, { status: 404 });
  }

  const client = new WorkerClient();
  const thinking = await client.getSessionThinkingLevel({
    sessionId,
    piSessionId: dbSession.piSessionId ?? undefined,
    project: dbSession.project,
  });
  return Response.json(thinking);
});

export const POST = withAuth(async (user, req) => {
  const sessionId = getSessionIdFromUrl(new URL(req.url));
  const dbSession = await getSession({ userId: user.id, sessionId });
  if (!dbSession) {
    return Response.json({ thinking: null }, { status: 404 });
  }

  const body = (await req.json()) as { level?: unknown };
  if (!isThinkingLevel(body.level)) {
    return Response.json(
      { error: "level must be one of: off, minimal, low, medium, high, xhigh" },
      { status: 400 },
    );
  }

  const client = new WorkerClient();
  const thinking = await client.setSessionThinkingLevel({
    sessionId,
    level: body.level,
    piSessionId: dbSession.piSessionId ?? undefined,
    project: dbSession.project,
  });
  return Response.json(thinking);
});
