import { EventType } from "@ag-ui/client";
import {
  FileTraceSink,
  isTracingEnabled,
  runWithTraceContext,
  getTraceLogger,
} from "@chatbot/tracing";
import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { WorkerClient } from "@/lib/features/agent-code/worker-client";
import { translatePiEvent } from "@/lib/features/agent-code/pi-to-agui-translator";
import {
  getSession,
  touchSession,
  updatePiSessionId,
} from "@/lib/features/agent-code/session-store";
import { toPiModelId } from "@/lib/features/agent-code/model-mapping";
import type { chatModelId } from "@/lib/features/foundation-model/config";

export const maxDuration = 240;

export const POST = withAuth(async (user, req) => {
  const body = await req.json();
  const threadId = body.threadId as string;
  const context = (body.context as Array<{ description: string; value: string }>) ?? [];
  const forwardedProps = (body.forwardedProps as Record<string, string>) ?? {};

  const project = context.find((c) => c.description === "project")?.value ?? forwardedProps.project;
  const sessionId = context.find((c) => c.description === "sessionId")?.value ?? forwardedProps.sessionId ?? threadId;
  const modelId = context.find((c) => c.description === "modelId")?.value ?? forwardedProps.modelId;

  if (!modelId) {
    return new Response(
      JSON.stringify({ error: "modelId is required in context or forwardedProps" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!project) {
    return new Response(
      JSON.stringify({ error: "project is required in context or forwardedProps" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const messages = body.messages as Array<{ role: string; content: string }>;

  const runId = crypto.randomUUID();
  const sink = isTracingEnabled() ? new FileTraceSink({ runId }) : null;
  await sink?.open();

  try {
    return await runWithTraceContext({ runId, sessionId, sink }, async () => {
      const log = getTraceLogger("bridge");
      log.info("request.start", { threadId, sessionId, project, modelId, messageCount: messages.length });

      const dbSession = await getSession({ userId: user.id, sessionId });
      log.info("db.lookup", { found: !!dbSession, sessionId });
      if (!dbSession) {
        await sink?.close();
        return new Response("Session not found", { status: 404 });
      }

      const client = new WorkerClient();

      const piModelId = modelId ? toPiModelId(modelId as chatModelId) : undefined;
      log.info("model.mapping", { from: modelId, to: piModelId });

      const initStop = log.startTimer("worker.initialize");
      const initResult = await client.initializeSession({
        userId: user.id,
        sessionId,
        project,
        modelId: piModelId ? `${piModelId.providerId}/${piModelId.modelId}` : undefined,
        piSessionId: dbSession.piSessionId ?? undefined,
        _traceRunId: runId,
      });
      initStop();

      // Persist the piSessionId mapping if it's new or changed
      if (initResult.piSessionId && initResult.piSessionId !== dbSession.piSessionId) {
        log.info("db.update_pi_session_id", {
          sessionId,
          piSessionId: initResult.piSessionId,
        });
        await updatePiSessionId({
          userId: user.id,
          sessionId,
          piSessionId: initResult.piSessionId,
        });
      }

      const prompt = messages[messages.length - 1]?.content ?? "";
      const sendStop = log.startTimer("worker.sendPrompt", { promptLength: prompt.length });
      const workerStream = await client.sendPrompt({ sessionId, prompt, _traceRunId: runId });
      sendStop();

      await touchSession({ userId: user.id, sessionId });

      log.info("stream.start");
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
                  log.debug("stream.event", { piType: piEvent.type, aguiType: aguiEvent.type });
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(aguiEvent)}\n\n`));
                } catch {
                  log.warn("stream.malformed", { line: line.slice(0, 500) });
                }
              }
            }
          } catch (err) {
            log.error("stream.error", { message: String(err) });
            const errorEvent = {
              type: EventType.RUN_ERROR,
              threadId: sessionId,
              runId,
              message: String(err),
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
          } finally {
            log.info("stream.close");
            controller.close();
            await sink?.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Trace-Run-Id": runId,
        },
      });
    });
  } catch (err) {
    await sink?.close();
    throw err;
  }
});
