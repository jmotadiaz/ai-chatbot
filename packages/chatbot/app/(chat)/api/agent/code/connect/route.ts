import { EventType, type BaseEvent } from "@ag-ui/client";
import { FileTraceSink, isTracingEnabled, runWithTraceContext, getTraceLogger } from "tracing";
import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { WorkerClient } from "@/lib/features/code/worker-client";
import { getSession, touchSession } from "@/lib/features/code/session-store";
import {
  emitAguiSseEvent,
  relayLoggedAguiNdjsonToSse,
  type RelaySummary,
} from "@/lib/features/code/agui-stream-relay";

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
  const runId = (body.runId as string | undefined) ?? crypto.randomUUID();
  const afterSeq =
    typeof forwardedProps.afterSeq === "number"
      ? forwardedProps.afterSeq
      : typeof body.afterSeq === "number"
        ? body.afterSeq
        : undefined;
  const epoch =
    typeof forwardedProps.epoch === "string"
      ? forwardedProps.epoch
      : typeof body.epoch === "string"
        ? body.epoch
        : undefined;

  if (!project) {
    return new Response(JSON.stringify({ error: "project is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (typeof afterSeq !== "number") {
    return new Response(JSON.stringify({ error: "afterSeq is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!epoch) {
    return new Response(JSON.stringify({ error: "epoch is required" }), {
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
      log.info("connect.start", { threadId, sessionId, project, afterSeq, epoch });

      const dbSession = await getSession({ userId: user.id, sessionId });
      if (!dbSession) {
        await closeSink();
        return new Response("Session not found", { status: 404 });
      }
      if (dbSession.project !== project) {
        await closeSink();
        return new Response("Session project mismatch", { status: 400 });
      }

      // Reconnecting a stream must never change the session's model: no
      // modelId is forwarded, so the worker keeps (or restores from the Pi
      // session file) whatever model the session was already using.
      const client = new WorkerClient();
      await client.initializeSession({
        userId: user.id,
        sessionId,
        project,
        piSessionId: dbSession.piSessionId ?? undefined,
        _traceRunId: runId,
      });

      await touchSession({ userId: user.id, sessionId });

      let workerStream: ReadableStream<Uint8Array>;
      try {
        workerStream = await client.connectToSession({
          sessionId,
          afterSeq,
          epoch,
          _traceRunId: runId,
        });
      } catch (err) {
        if (err instanceof Error && err.message.includes("Cursor epoch mismatch")) {
          await closeSink();
          return new Response("Cursor reset required", { status: 409 });
        }
        throw err;
      }

      const encoder = new TextEncoder();
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const streamStop = log.startTimer("connect.stream_duration", { sessionId });
          let relaySummary: RelaySummary | null = null;
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
