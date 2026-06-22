import { EventType } from "@ag-ui/client";
import { FileTraceSink, isTracingEnabled, runWithTraceContext, getTraceLogger } from "tracing";
import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { WorkerClient } from "@/lib/features/code/worker-client";
import { PiToAguiTranslator } from "@/lib/features/code/pi-to-agui-translator";
import { getSession, touchSession } from "@/lib/features/code/session-store";
import { toPiModelId } from "@/lib/features/code/model-mapping";
import type { chatModelId } from "@/lib/features/foundation-model/config";

export const maxDuration = 240;

export const POST = withAuth(async (user, req) => {
  const body = await req.json();
  const threadId = body.threadId as string;
  const context = (body.context as Array<{ description: string; value: string }>) ?? [];
  const forwardedProps = (body.forwardedProps as Record<string, string>) ?? {};

  const project =
    context.find((c) => c.description === "project")?.value ?? forwardedProps.project;
  const sessionId =
    context.find((c) => c.description === "sessionId")?.value ??
    forwardedProps.sessionId ??
    threadId;
  const modelId =
    context.find((c) => c.description === "modelId")?.value ?? forwardedProps.modelId;
  const runId = (body.runId as string) ?? crypto.randomUUID();

  if (!project) {
    return new Response(JSON.stringify({ error: "project is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!modelId) {
    return new Response(JSON.stringify({ error: "modelId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sink = isTracingEnabled() ? new FileTraceSink({ runId }) : null;
  await sink?.open();
  let sinkClosed = false;
  const closeSink = async () => {
    if (sinkClosed) return;
    sinkClosed = true;
    await sink?.close();
  };

  try {
    return await runWithTraceContext({ runId, sessionId, sink }, async () => {
      const log = getTraceLogger("bridge");
      log.info("connect.start", { threadId, sessionId, project, modelId });

      const dbSession = await getSession({ userId: user.id, sessionId });
      if (!dbSession) {
        await closeSink();
        return new Response("Session not found", { status: 404 });
      }

      const client = new WorkerClient();
      const piModelId = modelId ? toPiModelId(modelId as chatModelId) : undefined;
      await client.initializeSession({
        userId: user.id,
        sessionId,
        project,
        modelId: piModelId ? `${piModelId.providerId}/${piModelId.modelId}` : undefined,
        piSessionId: dbSession.piSessionId ?? undefined,
        _traceRunId: runId,
      });

      await touchSession({ userId: user.id, sessionId });

      const workerStream = await client.connectToSession({
        sessionId,
        _traceRunId: runId,
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const reader = workerStream.getReader();
          const decoder = new TextDecoder();
          const translator = new PiToAguiTranslator({ threadId: sessionId, runId });
          let buffer = "";
          let snapshotEmitted = false;

          const emit = (aguiEvent: object) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(aguiEvent)}\n\n`));
          };

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";

              for (const line of lines) {
                if (!line.trim()) continue;
                let piEvent: { type: string; [k: string]: unknown };
                try {
                  piEvent = JSON.parse(line);
                } catch {
                  log.warn("connect.malformed", { line: line.slice(0, 500) });
                  continue;
                }

                if (piEvent.type === "snapshot" && !snapshotEmitted) {
                  snapshotEmitted = true;
                  const inFlight = (piEvent.inFlight as Array<{
                    toolCallId: string;
                    name: string;
                    argsSoFar: string;
                    parentMessageId?: string;
                  }>) ?? [];
                  const messages = (piEvent.messages as Array<{ id?: string; role: string; content: string }>) ?? [];
                  emit({
                    type: EventType.MESSAGES_SNAPSHOT,
                    messages,
                    timestamp: Date.now(),
                  });
                  for (const t of inFlight) {
                    emit({
                      type: EventType.TOOL_CALL_START,
                      toolCallId: t.toolCallId,
                      toolCallName: t.name,
                      parentMessageId: t.parentMessageId,
                      timestamp: Date.now(),
                    });
                    if (t.argsSoFar) {
                      emit({
                        type: EventType.TOOL_CALL_ARGS,
                        toolCallId: t.toolCallId,
                        delta: t.argsSoFar,
                        timestamp: Date.now(),
                      });
                    }
                  }
                  continue;
                }

                if (piEvent.type === "snapshot") continue;

                const aguiEvents = translator.translate(piEvent as never);
                for (const e of aguiEvents) emit(e);
              }
            }
          } catch (err) {
            log.error("connect.error", { message: String(err) });
            emit({
              type: EventType.RUN_ERROR,
              threadId: sessionId,
              runId,
              message: String(err),
              timestamp: Date.now(),
            });
          } finally {
            log.info("connect.close");
            controller.close();
            await closeSink();
          }
        },
        async cancel() {
          await closeSink();
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
    await closeSink();
    throw err;
  }
});
