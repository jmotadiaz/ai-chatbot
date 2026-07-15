import { EventType, type BaseEvent } from "@ag-ui/client";
import { FileTraceSink, isTracingEnabled, runWithTraceContext, getTraceLogger } from "tracing";
import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { WorkerClient } from "@/lib/features/code/worker-client";
import { getSession, touchSession } from "@/lib/features/code/session-store";
import { toPiModelId } from "@/lib/features/code/model-mapping";
import {
  emitAguiSseEvent,
  parseAfterSeqOrUndefined,
  relayLoggedAguiNdjsonToSse,
  type RelaySummary,
} from "@/lib/features/code/agui-stream-relay";
import type { chatModelId } from "@/lib/features/foundation-model/config";

export const maxDuration = 240;

export const POST = withAuth(async (user, req) => {
  const body = await req.json();
  const threadId = body.threadId as string;
  const context = (body.context as Array<{ description: string; value: string }>) ?? [];
  const forwardedProps = (body.forwardedProps as Record<string, unknown>) ?? {};

  const project =
    context.find((c) => c.description === "project")?.value ??
    (typeof forwardedProps.project === "string" ? forwardedProps.project : undefined);
  const sessionId =
    context.find((c) => c.description === "sessionId")?.value ??
    (typeof forwardedProps.sessionId === "string" ? forwardedProps.sessionId : undefined) ??
    threadId;
  const modelId =
    context.find((c) => c.description === "modelId")?.value ??
    (typeof forwardedProps.modelId === "string" ? forwardedProps.modelId : undefined);
  const runId = (body.runId as string | undefined) ?? crypto.randomUUID();
  // Absent (or malformed) afterSeq is forwarded to the worker as
  // "not provided" so it can compute its own default replay window
  // (see connectToSession / computeDefaultAfterSeq in session-manager.ts).
  const afterSeq = parseAfterSeqOrUndefined(forwardedProps.afterSeq ?? body.afterSeq);

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
      log.info("connect.start", { threadId, sessionId, project, modelId, afterSeq });

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
        afterSeq,
        _traceRunId: runId,
      });

      const encoder = new TextEncoder();
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const streamStop = log.startTimer("connect.stream_duration", { sessionId });
          let relaySummary: RelaySummary | null = null;
          let skippedRunStarted = false;
          let skippedMessagesSnapshot = false;
          let closeReason = "reader_done";

          const emitTerminalIfNeeded = () => {
            if (cancelled || relaySummary?.terminalSeen) return;
            emitAguiSseEvent(controller, encoder, {
              type: EventType.RUN_FINISHED,
              threadId: sessionId,
              runId,
              timestamp: Date.now(),
            } as BaseEvent);
          };

          try {
            emitAguiSseEvent(controller, encoder, {
              type: EventType.RUN_STARTED,
              threadId: sessionId,
              runId,
              timestamp: Date.now(),
            } as BaseEvent);

            relaySummary = await relayLoggedAguiNdjsonToSse({
              workerStream,
              controller,
              encoder,
              log,
              onReader: (r) => {
                reader = r;
              },
              skipEvent: (event) => {
                if (!skippedRunStarted && event.type === EventType.RUN_STARTED) {
                  skippedRunStarted = true;
                  return true;
                }
                // The worker's default replay window already skips the
                // run-start MESSAGES_SNAPSHOT once any message in the run
                // has finalized (see computeDefaultAfterSeq in
                // session-manager.ts) — the client's SSR-loaded state is at
                // least as fresh by then, and re-merging that snapshot
                // corrupts message order. This is defense in depth for any
                // caller that explicitly requests an earlier cursor.
                if (!skippedMessagesSnapshot && event.type === EventType.MESSAGES_SNAPSHOT) {
                  skippedMessagesSnapshot = true;
                  return true;
                }
                return false;
              },
            });
            emitTerminalIfNeeded();
          } catch (err) {
            closeReason = "error";
            log.error("connect.error", { message: String(err) });
            if (!cancelled) {
              emitAguiSseEvent(controller, encoder, {
                type: EventType.RUN_ERROR,
                threadId: sessionId,
                runId,
                message: String(err),
                timestamp: Date.now(),
              } as BaseEvent);
            }
          } finally {
            streamStop();
            log.info("connect.stream_summary", {
              sessionId,
              afterSeq,
              closeReason,
              skippedRunStarted,
              relaySummary,
            });
            log.info("connect.close", { sessionId, closeReason });
            try {
              controller.close();
            } catch {
              // The browser may already have closed the HTTP stream.
            }
            await closeSink();
          }
        },
        async cancel() {
          cancelled = true;
          log.info("connect.cancel", { sessionId });
          if (reader) {
            try {
              await reader.cancel();
            } catch (err) {
              log.warn("connect.reader_cancel_failed", { message: String(err) });
            }
          }
          await closeSink();
        },
      });

      req.signal.addEventListener("abort", () => {
        cancelled = true;
        log.info("connect.client_aborted");
        if (reader) {
          reader.cancel().catch((err) => {
            log.warn("connect.reader_cancel_failed", { message: String(err) });
          });
        }
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
