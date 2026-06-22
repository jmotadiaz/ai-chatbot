import { getTraceLogger } from "tracing";
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

  log.info("rpc.request", { method, params });
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
        break;
      }
      case "sendPrompt": {
        const { sessionId, prompt, messages } = params as {
          sessionId: string;
          prompt: string;
          messages?: Array<{ role: string; content: string }>;
        };
        const stream = await sendPrompt(sessionId, prompt, messages);
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
        const { sessionId } = params as { sessionId: string };
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
    log.info("rpc.response", { method, result });
    return jsonResponse(result, id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("rpc.error", { method, message, stack: err instanceof Error ? err.stack : undefined });
    stop();
    return jsonResponse(null, id, { code: -32603, message });
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
