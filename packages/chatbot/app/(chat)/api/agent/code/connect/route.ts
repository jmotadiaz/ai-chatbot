import { EventType } from "@ag-ui/client";
import { FileTraceSink, isTracingEnabled, runWithTraceContext, getTraceLogger } from "tracing";
import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { WorkerClient } from "@/lib/features/code/worker-client";
import { PiToAguiTranslator } from "@/lib/features/code/pi-to-agui-translator";
import { getSession, touchSession } from "@/lib/features/code/session-store";
import { toPiModelId } from "@/lib/features/code/model-mapping";
import type { chatModelId } from "@/lib/features/foundation-model/config";

export const maxDuration = 240;

interface AguiMessage {
  id: string;
  role: string;
  content?: string;
  toolCallId?: string;
  toolCalls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

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
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          reader = workerStream.getReader();
          const decoder = new TextDecoder();
          const translator = new PiToAguiTranslator({ threadId: sessionId, runId });
          let buffer = "";
          let snapshotEmitted = false;
          let runStartedEmitted = false;

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

                log.info("connect.worker_event", {
                  type: piEvent.type,
                  payloadKeys: Object.keys(piEvent),
                });

                if (!runStartedEmitted) {
                  runStartedEmitted = true;
                  emit({
                    type: EventType.RUN_STARTED,
                    threadId: sessionId,
                    runId,
                    timestamp: Date.now(),
                  } as object);
                }

                if (piEvent.type === "snapshot" && !snapshotEmitted) {
                  snapshotEmitted = true;
                  const aguiMessages = ((piEvent.messages as Array<AguiMessage>) ?? []);
                  const inFlight = (piEvent.inFlight as Array<{
                    contentIndex: number;
                    toolCallId: string;
                    name: string;
                    argsSoFar: string;
                    parentMessageId?: string;
                    callEnded?: boolean;
                  }>) ?? [];
                  const isStreaming = (piEvent.isStreaming as boolean) ?? false;

                  log.info("connect.snapshot_received", {
                    sessionId,
                    messageCount: aguiMessages.length,
                    messagesOverview: aguiMessages.map(m => ({ id: m.id, role: m.role, hasToolCalls: !!m.toolCalls })),
                    inFlightCount: inFlight.length,
                    isStreaming,
                    inFlight: inFlight.map((t) => ({
                      contentIndex: t.contentIndex,
                      toolCallId: t.toolCallId,
                      name: t.name,
                      parentMessageId: t.parentMessageId,
                      callEnded: t.callEnded,
                    })),
                  });

                  const lastAssistantMsg = [...aguiMessages]
                    .reverse()
                    .find((m) => m.role === "assistant");

                  const inFlightWithParent = inFlight.find(
                    (t) => t.parentMessageId,
                  );
                  const liveMessageId =
                    inFlightWithParent?.parentMessageId ??
                    (isStreaming ? lastAssistantMsg?.id : undefined);

                  // Build the set of tool-call IDs whose result messages are
                  // already present in the snapshot. The translator must not
                  // re-emit TOOL_CALL_RESULT for them when the live stream
                  // replays tool_execution_end.
                  const emittedToolResultIds = new Set<string>();
                  for (const m of aguiMessages) {
                    if (m.role === "tool" && m.toolCallId) {
                      emittedToolResultIds.add(m.toolCallId);
                    }
                  }

                  // Build the stepNames map for in-flight tools whose
                  // tool_execution_start already happened before the
                  // snapshot. The matching STEP_FINISHED will be emitted
                  // by the translator when tool_execution_end arrives.
                  const stepNames = new Map<string, string>();
                  for (const t of inFlight) {
                    stepNames.set(
                      t.toolCallId,
                      `tool:${t.name}:${t.toolCallId}`,
                    );
                  }

                  const inFlightTools = new Map<
                    number,
                    { id: string; name: string }
                  >();
                  const unmappedToolCalls: Array<{ generatedId: string; name: string }> = [];
                  for (const t of inFlight) {
                    inFlightTools.set(t.contentIndex, {
                      id: t.toolCallId,
                      name: t.name,
                    });
                    if (t.toolCallId.startsWith("tool-") || t.toolCallId.startsWith("msg-")) {
                      unmappedToolCalls.push({
                        generatedId: t.toolCallId,
                        name: t.name,
                      });
                    }
                  }
                  translator.hydrateState({
                    currentMessageId: liveMessageId ?? null,
                    activeToolCalls: inFlightTools,
                    messageCounter:
                      aguiMessages.length + inFlight.length,
                    emittedToolResultIds,
                    stepNames,
                    unmappedToolCalls,
                  });
                  log.info("connect.translator_hydrated", {
                    sessionId,
                    currentMessageId: liveMessageId ?? null,
                    activeToolCallCount: inFlightTools.size,
                    messageCounter: aguiMessages.length + inFlight.length,
                    emittedToolResultCount: emittedToolResultIds.size,
                    stepNameCount: stepNames.size,
                  });

                  const parentMessageId = liveMessageId;

                  emit({
                    type: EventType.MESSAGES_SNAPSHOT,
                    messages: aguiMessages,
                    timestamp: Date.now(),
                  });

                  for (const t of inFlight) {
                    emit({
                      type: EventType.TOOL_CALL_START,
                      toolCallId: t.toolCallId,
                      toolCallName: t.name,
                      parentMessageId,
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
                    if (t.callEnded) {
                      emit({
                        type: EventType.TOOL_CALL_END,
                        toolCallId: t.toolCallId,
                        timestamp: Date.now(),
                      });
                      emit({
                        type: EventType.STEP_STARTED,
                        stepName: `tool:${t.name}:${t.toolCallId}`,
                        rawEvent: { toolCallId: t.toolCallId },
                        timestamp: Date.now(),
                      });
                    }
                  }
                  log.info("connect.inflight_events_emitted", {
                    sessionId,
                    toolCallCount: inFlight.length,
                    parentMessageId,
                  });
                  continue;
                }

                if (piEvent.type === "snapshot") continue;

                const aguiEvents = translator.translate(piEvent as never);
                for (const e of aguiEvents) {
                  // We already emitted a synthetic RUN_STARTED above. Skip
                  // any translated RUN_STARTED that the worker would emit
                  // via its own `agent_start` event — sending it twice
                  // violates the AG-UI verifyEvents invariant.
                  if (e.type === EventType.RUN_STARTED && runStartedEmitted) {
                    continue;
                  }
                  emit(e);
                }
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
