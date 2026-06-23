import { getTraceLogger, setTraceSessionId } from "tracing";
import {
  getOrCreateSession,
  sendPrompt,
  getAvailableModels,
  disposeSession,
  getSessionMessages,
  connectToSession,
  cancelRun,
  getSessionStatus,
} from "./session-manager";

export async function handleRpc(requestBody: string): Promise<Response> {
  const log = getTraceLogger("worker");
  const { method, params, id } = JSON.parse(requestBody) as {
    method: string;
    params: unknown;
    id: number;
  };

  setTraceSessionId(getSessionIdFromParams(params));
  log.info("rpc.request", { method, params: summarizeRpcParams(method, params) });
  const stop = log.startTimer("rpc.duration", { method });

  try {
    let result: unknown;

    switch (method) {
      case "initializeSession": {
        result = await getOrCreateSession(
          params as {
            userId: string;
            sessionId?: string;
            project: string;
            modelId?: string;
            piSessionId?: string;
          },
        );
        setTraceSessionId(
          (result as { sessionId?: string } | undefined)?.sessionId,
        );
        break;
      }
      case "sendPrompt": {
        const { sessionId, prompt, messages, _traceRunId } = params as {
          sessionId: string;
          prompt: string;
          messages?: Array<{
            id?: string;
            role: string;
            content?: unknown;
            toolCalls?: unknown;
            toolCallId?: string;
            name?: string;
          }>;
          _traceRunId?: string;
        };
        const stream = await sendPrompt(sessionId, prompt, messages, _traceRunId);
        stop();
        return new Response(stream, {
          headers: { "Content-Type": "application/x-ndjson" },
        });
      }
      case "getAvailableModels": {
        result = { models: await getAvailableModels() };
        break;
      }
      case "getSessionMessages": {
        const { sessionId, piSessionId, project } = params as {
          sessionId: string;
          piSessionId?: string;
          project?: string;
        };
        result = {
          messages: await getSessionMessages(sessionId, piSessionId, project),
        };
        break;
      }
      case "disposeSession": {
        const { sessionId } = params as { sessionId: string };
        await disposeSession(sessionId);
        result = null;
        break;
      }
      case "connectToSession": {
        const { sessionId, afterSeq } = params as { sessionId: string; afterSeq?: number };
        const encoder = new TextEncoder();
        let cleanup: () => void = () => {};
        let completed = false;
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              cleanup = await connectToSession(
                sessionId,
                (line) => controller.enqueue(encoder.encode(line)),
                (err) => {
                  log.error("connect.error", { message: String(err) });
                  try {
                    controller.error(err);
                  } catch {
                  }
                },
                () => {
                  if (completed) return;
                  completed = true;
                  try {
                    controller.close();
                  } catch {
                    // already closed; ignore
                  }
                },
                typeof afterSeq === "number" ? afterSeq : 0,
              );
            } catch (err) {
              log.error("connect.setup_error", { message: String(err) });
              controller.error(err);
            }
          },
          cancel() {
            cleanup();
          },
        });
        stop();
        return new Response(stream, {
          headers: { "Content-Type": "application/x-ndjson" },
        });
      }
      case "cancelRun": {
        const { sessionId } = params as { sessionId: string };
        result = await cancelRun(sessionId);
        break;
      }
      case "getSessionStatus": {
        const { sessionId } = params as { sessionId: string };
        result = await getSessionStatus(sessionId);
        break;
      }
      default: {
        log.warn("rpc.unknown_method", { method });
        stop();
        return jsonResponse(null, id, {
          code: -32601,
          message: `Method not found: ${method}`,
        });
      }
    }

    stop();
    log.info("rpc.response", { method, result: summarizeRpcResult(method, result) });
    return jsonResponse(result, id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("rpc.error", { method, message, stack: err instanceof Error ? err.stack : undefined });
    stop();
    return jsonResponse(null, id, { code: -32603, message });
  }
}

function getSessionIdFromParams(params: unknown): string | undefined {
  if (!params || typeof params !== "object") return undefined;
  const sessionId = (params as { sessionId?: unknown }).sessionId;
  return typeof sessionId === "string" ? sessionId : undefined;
}

function summarizeRpcParams(method: string, params: unknown): unknown {
  if (!params || typeof params !== "object") return params;
  const p = params as Record<string, unknown>;
  const sessionId = typeof p.sessionId === "string" ? p.sessionId : undefined;
  const hasTraceRunId = typeof p._traceRunId === "string";

  switch (method) {
    case "initializeSession":
      return {
        sessionId,
        project: typeof p.project === "string" ? p.project : undefined,
        modelId: typeof p.modelId === "string" ? p.modelId : undefined,
        hasPiSessionId: typeof p.piSessionId === "string",
        hasTraceRunId,
      };
    case "sendPrompt":
      return {
        sessionId,
        promptLength: typeof p.prompt === "string" ? p.prompt.length : 0,
        messageCount: Array.isArray(p.messages) ? p.messages.length : 0,
        hasTraceRunId,
      };
    case "getSessionMessages":
      return {
        sessionId,
        project: typeof p.project === "string" ? p.project : undefined,
        hasPiSessionId: typeof p.piSessionId === "string",
      };
    case "setModel":
      return {
        sessionId,
        modelId: typeof p.modelId === "string" ? p.modelId : undefined,
      };
    case "disposeSession":
    case "cancelRun":
    case "getSessionStatus":
      return { sessionId, hasTraceRunId };
    case "connectToSession":
      return {
        sessionId,
        afterSeq: typeof p.afterSeq === "number" ? p.afterSeq : undefined,
        hasTraceRunId,
      };
    default:
      return { sessionId, keys: Object.keys(p).sort(), hasTraceRunId };
  }
}

function summarizeRpcResult(method: string, result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const r = result as Record<string, unknown>;
  switch (method) {
    case "initializeSession":
      return {
        sessionId: r.sessionId,
        piSessionId: r.piSessionId,
      };
    case "getAvailableModels":
      return {
        modelCount: Array.isArray(r.models) ? r.models.length : 0,
      };
    case "getSessionMessages":
      return {
        messageCount: Array.isArray(r.messages) ? r.messages.length : 0,
      };
    default:
      return result;
  }
}

function jsonResponse(
  result: unknown,
  id: number,
  error?: { code: number; message: string },
) {
  const body: {
    jsonrpc: "2.0";
    result?: unknown;
    error?: { code: number; message: string };
    id: number;
  } = {
    jsonrpc: "2.0",
    id,
  };
  if (error) {
    body.error = error;
  } else {
    body.result = result;
  }
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}
