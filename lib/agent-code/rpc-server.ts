import {
  getOrCreateSession,
  sendPrompt,
  getAvailableModels,
  disposeSession,
} from "./session-manager";

export async function handleRpc(requestBody: string): Promise<Response> {
  const { method, params, id } = JSON.parse(requestBody) as {
    method: string;
    params: unknown;
    id: number;
  };

  try {
    switch (method) {
      case "initializeSession": {
        const result = await getOrCreateSession(
          params as {
            userId: string;
            sessionId?: string;
            project: string;
            modelId?: string;
          },
        );
        return jsonResponse(result, id);
      }
      case "sendPrompt": {
        const { sessionId, prompt } = params as {
          sessionId: string;
          prompt: string;
        };
        const stream = await sendPrompt(sessionId, prompt);
        return new Response(stream, {
          headers: { "Content-Type": "application/x-ndjson" },
        });
      }
      case "getAvailableModels": {
        const result = await getAvailableModels();
        return jsonResponse({ models: result }, id);
      }
      case "disposeSession": {
        const { sessionId } = params as { sessionId: string };
        await disposeSession(sessionId);
        return jsonResponse(null, id);
      }
      default:
        return jsonResponse(null, id, {
          code: -32601,
          message: `Method not found: ${method}`,
        });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
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
