import { getDefaultThinkingLevel, toChatModelId, toPiModelId } from "models";
import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { WorkerClient } from "@/lib/features/code/worker-client";
import { getSession } from "@/lib/features/code/session-store";
import type { chatModelId } from "@/lib/features/foundation-model/config";

function getSessionIdFromUrl(url: URL): string {
  const parts = url.pathname.split("/");
  // /api/agent/code/sessions/[sessionId]/model
  return decodeURIComponent(parts[parts.length - 2] ?? "");
}

/**
 * The worker (Pi session) is the authority on which model a session uses.
 * The DB modelId is only the model the session was created with, used as a
 * fallback when the worker has no session material yet.
 */
export const GET = withAuth(async (user, req) => {
  const sessionId = getSessionIdFromUrl(new URL(req.url));
  const dbSession = await getSession({ userId: user.id, sessionId });
  if (!dbSession) {
    return new Response("Session not found", { status: 404 });
  }

  const client = new WorkerClient();
  const { model } = await client.getSessionModel({
    sessionId,
    piSessionId: dbSession.piSessionId ?? undefined,
    project: dbSession.project,
  });

  const modelId =
    (model ? toChatModelId(model.providerId, model.modelId) : undefined) ??
    dbSession.modelId ??
    null;
  return Response.json({ modelId });
});

/**
 * Applies a model change to the worker session immediately (setModel +
 * defaultThinkingLevel in one RPC), instead of waiting for the next message.
 */
export const POST = withAuth(async (user, req) => {
  const sessionId = getSessionIdFromUrl(new URL(req.url));
  const dbSession = await getSession({ userId: user.id, sessionId });
  if (!dbSession) {
    return Response.json({ modelId: null }, { status: 404 });
  }

  const body = (await req.json()) as { modelId?: string };
  if (!body.modelId) {
    return Response.json({ error: "modelId is required" }, { status: 400 });
  }

  let piModelId: { providerId: string; modelId: string };
  try {
    piModelId = toPiModelId(body.modelId as chatModelId);
  } catch {
    return Response.json(
      { error: `Unknown model: ${body.modelId}` },
      { status: 400 },
    );
  }

  const defaultThinkingLevel = getDefaultThinkingLevel(
    body.modelId as chatModelId,
  );
  const client = new WorkerClient();
  await client.initializeSession({
    userId: user.id,
    sessionId,
    project: dbSession.project,
    modelId: `${piModelId.providerId}/${piModelId.modelId}`,
    defaultThinkingLevel,
    piSessionId: dbSession.piSessionId ?? undefined,
  });
  return Response.json({ modelId: body.modelId });
});
