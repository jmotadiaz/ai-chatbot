import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { WorkerClient } from "@/lib/features/agent-code/worker-client";
import { translatePiEvent } from "@/lib/features/agent-code/pi-to-agui-translator";
import { getSession, touchSession } from "@/lib/features/agent-code/session-store";
import { toPiModelId } from "@/lib/features/agent-code/model-mapping";

export const maxDuration = 240;

export const POST = withAuth(async (user, req) => {
  const { threadId, runId, project, sessionId, messages, modelId } = await req.json();

  const dbSession = await getSession({ userId: user.id, sessionId });
  if (!dbSession) {
    return new Response("Session not found", { status: 404 });
  }

  const client = new WorkerClient();

  const piModelId = modelId ? toPiModelId(modelId) : undefined;
  await client.initializeSession({
    userId: user.id,
    sessionId,
    project,
    modelId: piModelId ? `${piModelId.providerId}/${piModelId.modelId}` : undefined,
  });

  const prompt = messages[messages.length - 1]?.content ?? "";
  const workerStream = await client.sendPrompt({ sessionId, prompt });

  await touchSession({ userId: user.id, sessionId });

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
              const aguiEvent = translatePiEvent(piEvent);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(aguiEvent)}\n\n`));
            } catch {
              // Skip malformed lines
            }
          }
        }
      } catch (err) {
        const errorEvent = { type: "RUN_ERROR", error: String(err) };
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
