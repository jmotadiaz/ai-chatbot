import { EventType, type BaseEvent } from "@ag-ui/client";
import { extractUserContentParts } from "coding-agent/attached-files";
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
import { parseLeadingSkillCommands } from "@/lib/features/code/skill-commands";

export const maxDuration = 240;

export interface RequestMessage {
  id?: string;
  role: string;
  content?: unknown;
  toolCalls?: unknown;
  toolCallId?: string;
  name?: string;
}

// Extracts the typed text from a client message's content, which is either
// a plain string or an AG-UI `InputContent[]` (text/image/document parts,
// present when the message carries attachments). Used both for the prompt
// sent to the worker and for deriving the session label.
// Exported for unit testing; Next.js only special-cases the uppercase HTTP
// method exports (GET/POST/...), so this extra export is inert for routing.
export function promptTextFromContent(content: unknown): string {
  return extractUserContentParts(content).text;
}

// The worker only reads the last client message's content (see
// startPromptCollector in packages/coding-agent/src/session-manager.ts) —
// earlier messages are forwarded solely to help it stay in sync, never
// parsed for attachments. Blanking out their base64 payloads avoids
// re-shipping the whole attachment history to the worker on every turn.
export function stripNonTailAttachmentData(messages: RequestMessage[]): RequestMessage[] {
  if (messages.length === 0) return messages;
  const lastIndex = messages.length - 1;
  return messages.map((message, index) => {
    if (index === lastIndex || !Array.isArray(message.content)) return message;
    const content = (message.content as Array<Record<string, unknown>>).map((part) => {
      const source = part?.source as { type?: string; value?: unknown } | undefined;
      if (part?.type !== "text" && source?.type === "data") {
        return { ...part, source: { ...source, value: "" } };
      }
      return part;
    });
    return { ...message, content };
  });
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

      const prompt = promptTextFromContent(messages[messages.length - 1]?.content);
      const sendStop = log.startTimer("worker.sendPrompt", {
        promptLength: prompt.length,
      });
      const workerStream = await client.sendPrompt({
        sessionId,
        prompt,
        messages: stripNonTailAttachmentData(messages),
        _traceRunId: runId,
      });
      sendStop();

      await touchSession({ userId: user.id, sessionId });

      // Save first user message as session label (if not already set)
      if (!dbSession.label) {
        const firstUserMsg = messages.find((m) => m.role === "user");
        const label = parseLeadingSkillCommands(
          promptTextFromContent(firstUserMsg?.content),
        ).text.trim();
        if (label) {
          const finalLabel = label.split("\n")[0]!.slice(0, 80);
          await updateSessionLabel({
            userId: user.id,
            sessionId,
            label: finalLabel,
          });
          log.info("db.label_saved", { sessionId, label: finalLabel });
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
