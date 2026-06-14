import { EventType } from "@ag-ui/client";
import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { WorkerClient } from "@/lib/features/agent-code/worker-client";
import { translatePiEvent } from "@/lib/features/agent-code/pi-to-agui-translator";
import { getSession, touchSession } from "@/lib/features/agent-code/session-store";
import { toPiModelId } from "@/lib/features/agent-code/model-mapping";
import type { chatModelId } from "@/lib/features/foundation-model/config";

export const maxDuration = 240;

export const POST = withAuth(async (user, req) => {
  const body = await req.json();
  const threadId = body.threadId as string;
  const forwardedProps = (body.forwardedProps as Record<string, string>) ?? {};
  const project = forwardedProps.project;
  const sessionId = forwardedProps.sessionId ?? threadId;
  const modelId = forwardedProps.modelId;
  const messages = body.messages as Array<{ role: string; content: string }>;

  const dbSession = await getSession({ userId: user.id, sessionId });
  if (!dbSession) {
    return new Response("Session not found", { status: 404 });
  }

  const client = new WorkerClient();

  const piModelId = modelId ? toPiModelId(modelId as chatModelId) : undefined;
  await client.initializeSession({
    userId: user.id,
    sessionId,
    project,
    modelId: piModelId ? `${piModelId.providerId}/${piModelId.modelId}` : undefined,
  });

  const prompt = messages[messages.length - 1]?.content ?? "";
  const workerStream = await client.sendPrompt({ sessionId, prompt });

  await touchSession({ userId: user.id, sessionId });

  const runId = crypto.randomUUID();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = workerStream.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const piEvent = JSON.parse(line);
              const aguiEvent = translatePiEvent(piEvent, {
                threadId: sessionId,
                runId,
              });
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(aguiEvent)}\n\n`));
            } catch {
              // Skip malformed lines
            }
          }
        }
      } catch (err) {
        const errorEvent = {
          type: EventType.RUN_ERROR,
          threadId: sessionId,
          runId,
          message: String(err),
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
