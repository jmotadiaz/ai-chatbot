import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "config";
import {
  acquireTraceSink,
  getTraceLogger,
  releaseTraceSink,
  runWithTraceContext,
  setTraceSessionId,
} from "tracing";
import type { ThinkingLevel } from "models";
import {
  getOrCreateSession,
  sendPrompt,
  getAvailableModels,
  disposeSession,
  getSessionMessages,
  getSessionSnapshot,
  connectToSession,
  cancelRun,
  getSessionStatus,
  getSubagentSessionForToolCall,
  getSessionModel,
  getSessionThinkingLevel,
  getSessionSkills,
  runSubagent,
  getSessionPrompts,
  resolvePrompt,
} from "../session-manager";
import { setSubagentRunner } from "../subagent-bridge";

export interface HttpTransportOptions {
  port: number;
  host?: string;
}

interface RequestTraceMetadata {
  runId: string;
  sessionId?: string;
  method?: string;
}

export function startHttpTransport(options: HttpTransportOptions) {
  // Must happen before any session exists: Pi loads the subagent extension
  // when it builds a session runtime, and the extension resolves the runner
  // off globalThis rather than importing it (see subagent-bridge).
  setSubagentRunner(runSubagent);

  const server = createServer(handleHttpRequest);
  const onListening = () => {
    const host = options.host ?? "localhost";
    console.log(`Coding agent worker listening on http://${host}:${options.port}`);
  };

  if (options.host) {
    server.listen(options.port, options.host, onListening);
  } else {
    server.listen(options.port, onListening);
  }

  return server;
}

async function handleHttpRequest(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST" || req.url !== "/rpc") {
    res.writeHead(404).end("Not found");
    return;
  }

  const body = await readRequestBody(req);
  const { runId, sessionId, method } = parseTraceMetadata(body);
  // The sink is ref-counted per run, not owned by this request: work started
  // here can outlive the response (a prompt turn keeps running after the
  // browser disconnects) and must keep tracing until it really ends.
  const sink = await acquireTraceSink({ runId, truncate: false });

  try {
    await runWithTraceContext({ runId, sessionId, sink }, async () => {
      const response = await handleRpc(body);
      await writeFetchResponseToNode(response, res, { method, sessionId });
    });
  } finally {
    await releaseTraceSink(runId);
  }
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function parseTraceMetadata(body: string): RequestTraceMetadata {
  try {
    const parsed = JSON.parse(body) as {
      method?: string;
      params?: { _traceRunId?: string; sessionId?: string };
    };
    return {
      runId: parsed.params?._traceRunId ?? crypto.randomUUID(),
      sessionId: parsed.params?.sessionId,
      method: parsed.method,
    };
  } catch {
    return { runId: crypto.randomUUID() };
  }
}

async function writeFetchResponseToNode(
  response: Response,
  res: ServerResponse,
  metadata: { method?: string; sessionId?: string },
): Promise<void> {
  const log = getTraceLogger("worker");
  res.writeHead(
    response.status,
    Object.fromEntries(response.headers.entries()),
  );

  if (!response.body) {
    res.end();
    return;
  }

  const reader = response.body.getReader();
  const stopStream = log.startTimer("worker.response_stream", {
    method: metadata.method,
    sessionId: metadata.sessionId,
    status: response.status,
  });
  let chunkCount = 0;
  let byteCount = 0;
  let closedByClient = false;
  const onClose = () => {
    if (!res.writableEnded) {
      closedByClient = true;
      log.warn("worker.response_client_closed", {
        method: metadata.method,
        sessionId: metadata.sessionId,
        chunkCount,
        byteCount,
      });
    }
    reader.cancel().catch(() => {});
  };

  res.on("close", onClose);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunkCount += 1;
      byteCount += value.byteLength;
      res.write(value);
    }
  } finally {
    res.off("close", onClose);
    reader.releaseLock();
    stopStream();
    log.info("worker.response_stream_summary", {
      method: metadata.method,
      sessionId: metadata.sessionId,
      status: response.status,
      chunkCount,
      byteCount,
      closedByClient,
    });
    res.end();
  }
}

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
            thinkingLevel?: ThinkingLevel;
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
        const { sessionId, piSessionId, project, parentSessionId } = params as {
          sessionId: string;
          piSessionId?: string;
          project?: string;
          parentSessionId?: string;
        };
        result = {
          messages: await getSessionMessages(sessionId, piSessionId, project, parentSessionId),
        };
        break;
      }
      case "getSessionSnapshot": {
        const { sessionId, piSessionId, project, parentSessionId } = params as {
          sessionId: string;
          piSessionId?: string;
          project?: string;
          parentSessionId?: string;
        };
        result = await getSessionSnapshot(sessionId, piSessionId, project, parentSessionId);
        break;
      }
      case "disposeSession": {
        const { sessionId } = params as { sessionId: string };
        await disposeSession(sessionId);
        result = null;
        break;
      }
      case "connectToSession": {
        const { sessionId, afterSeq, epoch, parentSessionId } = params as {
          sessionId: string;
          afterSeq?: number;
          epoch?: string;
          parentSessionId?: string;
        };
        if (typeof afterSeq !== "number" || typeof epoch !== "string") {
          stop();
          return jsonResponse(null, id, {
            code: -32602,
            message: "afterSeq and epoch are required",
          });
        }
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
                afterSeq,
                epoch,
                parentSessionId,
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
      case "getSubagentSession": {
        const { parentSessionId, toolCallId } = params as {
          parentSessionId: string;
          toolCallId: string;
        };
        result = await getSubagentSessionForToolCall(parentSessionId, toolCallId);
        break;
      }
      case "getSessionStatus": {
        const { sessionId, parentSessionId } = params as {
          sessionId: string;
          parentSessionId?: string;
        };
        result = await getSessionStatus(sessionId, parentSessionId);
        break;
      }
      case "getSessionModel": {
        const { sessionId, piSessionId, project } = params as {
          sessionId: string;
          piSessionId?: string;
          project?: string;
        };
        result = { model: await getSessionModel(sessionId, piSessionId, project) };
        break;
      }
      case "getSessionThinkingLevel": {
        const { sessionId, piSessionId, project } = params as {
          sessionId: string;
          piSessionId?: string;
          project?: string;
        };
        result = {
          thinking: await getSessionThinkingLevel(sessionId, piSessionId, project),
        };
        break;
      }
      case "getSessionSkills": {
        const { sessionId } = params as { sessionId: string };
        result = { skills: getSessionSkills(sessionId) };
        break;
      }
      case "getSessionPrompts": {
        const { sessionId } = params as { sessionId: string };
        result = { prompts: getSessionPrompts(sessionId) };
        break;
      }
      case "resolvePrompt": {
        const { sessionId, promptName, values } = params as {
          sessionId: string;
          promptName: string;
          values: Record<string, string>;
        };
        result = resolvePrompt(sessionId, promptName, values);
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

export function summarizeRpcParams(method: string, params: unknown): unknown {
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
        thinkingLevel:
          typeof p.thinkingLevel === "string" ? p.thinkingLevel : undefined,
        hasPiSessionId: typeof p.piSessionId === "string",
        hasTraceRunId,
      };
    case "sendPrompt": {
      const messages = Array.isArray(p.messages) ? p.messages : [];
      const lastMessage = messages[messages.length - 1] as
        | { content?: unknown }
        | undefined;
      const lastContent = Array.isArray(lastMessage?.content)
        ? lastMessage.content
        : [];
      return {
        sessionId,
        promptLength: typeof p.prompt === "string" ? p.prompt.length : 0,
        messageCount: messages.length,
        lastMessagePartCount: lastContent.length,
        imageCount: lastContent.filter(
          (c) => (c as { type?: unknown })?.type === "image",
        ).length,
        documentCount: lastContent.filter(
          (c) => (c as { type?: unknown })?.type === "document",
        ).length,
        hasTraceRunId,
      };
    }
    case "getSessionMessages":
      return {
        sessionId,
        project: typeof p.project === "string" ? p.project : undefined,
        hasPiSessionId: typeof p.piSessionId === "string",
        hasParentSessionId: typeof p.parentSessionId === "string",
      };
    case "getSessionSnapshot":
    case "getSessionModel":
      return {
        sessionId,
        project: typeof p.project === "string" ? p.project : undefined,
        hasPiSessionId: typeof p.piSessionId === "string",
        hasParentSessionId: typeof p.parentSessionId === "string",
      };
    case "getSessionThinkingLevel":
      return {
        sessionId,
        hasPiSessionId: typeof p.piSessionId === "string",
        project: typeof p.project === "string" ? p.project : undefined,
      };
    case "getSessionSkills":
      return { sessionId };
    case "getSubagentSession":
      return {
        hasParentSessionId: typeof p.parentSessionId === "string",
        toolCallId: typeof p.toolCallId === "string" ? p.toolCallId : undefined,
      };
    case "disposeSession":
    case "cancelRun":
    case "getSessionStatus":
      return { sessionId, hasTraceRunId };
    case "connectToSession":
      return {
        sessionId,
        afterSeq: typeof p.afterSeq === "number" ? p.afterSeq : undefined,
        epoch: typeof p.epoch === "string" ? p.epoch : undefined,
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
    case "getSessionSnapshot": {
      const cursor = r.cursor as { epoch?: unknown; seq?: unknown } | null;
      return {
        messageCount: Array.isArray(r.messages) ? r.messages.length : 0,
        running: r.running === true,
        cursorSeq: cursor && typeof cursor.seq === "number" ? cursor.seq : undefined,
      };
    }
    case "getSessionModel": {
      const model = r.model as { providerId?: unknown; modelId?: unknown } | null;
      return {
        model: model ? `${model.providerId}/${model.modelId}` : null,
      };
    }
    case "getSessionThinkingLevel": {
      const thinking = r.thinking as { level?: unknown; levels?: unknown } | null;
      return {
        level: thinking && typeof thinking.level === "string" ? thinking.level : null,
        levelCount:
          thinking && Array.isArray(thinking.levels) ? thinking.levels.length : 0,
      };
    }
    case "getSessionSkills":
      return {
        skillCount: Array.isArray(r.skills) ? r.skills.length : 0,
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

function parsePort(): number {
  return config.codingAgentWorkerPort();
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint
    ? resolve(entrypoint) === fileURLToPath(import.meta.url)
    : false;
}

if (isMainModule()) {
  startHttpTransport({ port: parsePort() });
}
