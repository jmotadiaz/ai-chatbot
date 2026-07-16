import { EventType, type BaseEvent } from "@ag-ui/client";
import {
  FileTraceSink,
  isTracingEnabled,
  runWithTraceContext,
  getTraceLogger,
} from "tracing";
import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { WorkerClient } from "@/lib/features/code/worker-client";
import {
  emitAguiSseEvent,
  relayLoggedAguiNdjsonToSse,
  type RelaySummary,
} from "@/lib/features/code/agui-stream-relay";
import {
  getSession,
  touchSession,
  updatePiSessionId,
  updateSessionLabel,
} from "@/lib/features/code/session-store";
import { toPiModelId } from "@/lib/features/code/model-mapping";
import type { chatModelId } from "@/lib/features/foundation-model/config";

export const maxDuration = 240;

interface RequestMessage {
  id?: string;
  role: string;
  content?: unknown;
  toolCalls?: unknown;
  toolCallId?: string;
  name?: string;
}

function promptFromMessage(message: RequestMessage | undefined): string {
  if (!message) return "";
  return typeof message.content === "string" ? message.content : "";
}

export const POST = withAuth(async (user, req) => {
  const body = await req.json();
  const threadId = body.threadId as string;
  const context =
    (body.context as Array<{ description: string; value: string }>) ?? [];
  const forwardedProps = (body.forwardedProps as Record<string, string>) ?? {};

  const project =
    context.find((c) => c.description === "project")?.value ??
    forwardedProps.project;
  const sessionId =
    context.find((c) => c.description === "sessionId")?.value ??
    forwardedProps.sessionId ??
    threadId;
  const modelId =
    context.find((c) => c.description === "modelId")?.value ??
    forwardedProps.modelId;

  if (!modelId) {
    return new Response(
      JSON.stringify({
        error: "modelId is required in context or forwardedProps",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!project) {
    return new Response(
      JSON.stringify({
        error: "project is required in context or forwardedProps",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const messages = (Array.isArray(body.messages)
    ? body.messages
    : []) as RequestMessage[];

  const runId = (body.runId as string | undefined) ?? crypto.randomUUID();
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
      log.info("request.start", {
        threadId,
        sessionId,
        project,
        modelId,
        messageCount: messages.length,
      });

      const dbSession = await getSession({ userId: user.id, sessionId });
      log.info("db.lookup", { found: !!dbSession, sessionId });
      if (!dbSession) {
        await closeSink();
        return new Response("Session not found", { status: 404 });
      }
      if (dbSession.project !== project) {
        await closeSink();
        return new Response("Session project mismatch", { status: 400 });
      }

      const client = new WorkerClient();

      const piModelId = modelId
        ? toPiModelId(modelId as chatModelId)
        : undefined;
      log.info("model.mapping", { from: modelId, to: piModelId });

      const initStop = log.startTimer("worker.initialize");
      const initResult = await client.initializeSession({
        userId: user.id,
        sessionId,
        project,
        modelId: piModelId
          ? `${piModelId.providerId}/${piModelId.modelId}`
          : undefined,
        piSessionId: dbSession.piSessionId ?? undefined,
        _traceRunId: runId,
      });
      initStop();

      // Persist the piSessionId mapping if it's new or changed
      if (
        initResult.piSessionId &&
        initResult.piSessionId !== dbSession.piSessionId
      ) {
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

      const prompt = promptFromMessage(messages[messages.length - 1]);
      const sendStop = log.startTimer("worker.sendPrompt", {
        promptLength: prompt.length,
      });
      const workerStream = await client.sendPrompt({
        sessionId,
        prompt,
        messages,
        _traceRunId: runId,
      });
      sendStop();

      await touchSession({ userId: user.id, sessionId });

      // Save first user message as session label (if not already set)
      if (!dbSession.label) {
        const firstUserMsg = messages.find(
          (m) => m.role === "user" && typeof m.content === "string",
        );
        if (typeof firstUserMsg?.content === "string" && firstUserMsg.content.trim()) {
          const label = firstUserMsg.content
            .trim()
            .split("\n")[0]!
            .slice(0, 80);
          await updateSessionLabel({
            userId: user.id,
            sessionId,
            label,
          });
          log.info("db.label_saved", { sessionId, label });
        }
      }

      log.info("stream.start");
      const encoder = new TextEncoder();
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const streamStop = log.startTimer("stream.duration", { sessionId });
          let relaySummary: RelaySummary | null = null;
          let closeReason = "reader_done";

          try {
            relaySummary = await relayLoggedAguiNdjsonToSse({
              workerStream,
              controller,
              encoder,
              log,
              onReader: (r) => {
                reader = r;
              },
              burstPacing: { enabled: true },
            });
          } catch (err) {
            closeReason = "error";
            log.error("stream.error", { message: String(err) });
            const errorEvent = {
              type: EventType.RUN_ERROR,
              threadId: sessionId,
              runId,
              message: String(err),
            } as BaseEvent;
            emitAguiSseEvent(controller, encoder, errorEvent);
          } finally {
            streamStop();
            log.info("stream.summary", {
              sessionId,
              closeReason,
              relaySummary,
            });
            log.info("stream.close", { sessionId, closeReason });
            controller.close();
            await closeSink();
          }
        },
        async cancel() {
          log.info("stream.cancel", { sessionId });
          if (reader) {
            try {
              await reader.cancel();
            } catch (err) {
              log.warn("stream.reader_cancel_failed", { message: String(err) });
            }
          }
          await closeSink();
        },
      });

      req.signal.addEventListener("abort", () => {
        log.info("client.aborted");
        if (reader) {
          reader.cancel().catch((err) => {
            log.warn("stream.reader_cancel_failed", { message: String(err) });
          });
        }
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
          "X-Trace-Run-Id": runId,
        },
      });
    });
  } catch (err) {
    await closeSink();
    throw err;
  }
});
