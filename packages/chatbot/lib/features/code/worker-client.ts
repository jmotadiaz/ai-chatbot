import { getTraceLogger } from "tracing";
import type { ThinkingLevel } from "models";

export interface WorkerModel {
  providerId: string;
  modelId: string;
  label: string;
}

export interface WorkerSkill {
  name: string;
  description: string;
}

export interface PromptInput {
  name: string;
  kind: string;
  description: string;
  required: boolean;
  default?: string;
  enumValues?: string[];
  placeholder?: string;
  render?: string;
}

export interface PromptSummary {
  name: string;
  description: string;
  inputs: PromptInput[];
}

export interface SessionSummary {
  sessionId: string;
  label: string | null;
}

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params: unknown;
  id: number;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  result?: T;
  error?: { code: number; message: string };
  id: number;
}

export interface WorkerSnapshotMessage {
  id?: string;
  role: string;
  content?: unknown;
  toolCalls?: unknown;
  toolCallId?: string;
  name?: string;
}

export interface WorkerSessionCursor {
  epoch: string;
  seq: number;
}

export interface WorkerSessionSnapshot {
  messages: Array<{
    id?: string;
    role: string;
    content: unknown;
    toolCalls?: unknown;
    toolCallId?: string;
  }>;
  cursor: WorkerSessionCursor | null;
  running: boolean;
}

export class WorkerClient {
  private baseUrl: string;
  private id = 0;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env.CODING_AGENT_WORKER_URL ?? "http://localhost:3015";
  }

  private async call<T>(method: string, params: unknown): Promise<T> {
    const log = getTraceLogger("bridge");
    const id = ++this.id;
    const traceParams = summarizeWorkerRpcParams(method, params);
    const stop = log.startTimer("rpc.call", { method, params: traceParams });

    const body: JsonRpcRequest = { jsonrpc: "2.0", method, params, id };
    const res = await fetch(`${this.baseUrl}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      log.error("rpc.http_error", { method, params: traceParams, status: res.status, statusText: res.statusText });
      stop();
      throw new Error(`Worker request failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as JsonRpcResponse<T>;
    if (data.error) {
      log.error("rpc.error", { method, params: traceParams, code: data.error.code, message: data.error.message });
      stop();
      throw new Error(`Worker RPC error: ${data.error.message}`);
    }

    stop();
    return data.result as T;
  }

  async initializeSession(params: {
    userId: string;
    sessionId?: string;
    project: string;
    modelId?: string;
    defaultThinkingLevel?: ThinkingLevel;
    piSessionId?: string;
    _traceRunId?: string;
  }): Promise<{ sessionId: string; piSessionId: string }> {
    return this.call("initializeSession", params);
  }

  async sendPrompt(params: {
    sessionId: string;
    prompt: string;
    messages?: WorkerSnapshotMessage[];
    _traceRunId?: string;
  }): Promise<ReadableStream<Uint8Array>> {
    const log = getTraceLogger("bridge");
    const id = ++this.id;
    const traceParams = summarizeWorkerRpcParams("sendPrompt", params);
    const stop = log.startTimer("rpc.call", { method: "sendPrompt", params: traceParams });

    const body: JsonRpcRequest = {
      jsonrpc: "2.0",
      method: "sendPrompt",
      params,
      id,
    };
    const res = await fetch(`${this.baseUrl}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      log.error("rpc.http_error", { method: "sendPrompt", params: traceParams, status: res.status, statusText: res.statusText });
      stop();
      throw new Error(`Worker request failed: ${res.status} ${res.statusText}`);
    }

    if (!res.body) {
      log.error("rpc.no_body", { method: "sendPrompt", params: traceParams });
      stop();
      throw new Error("Worker response has no body");
    }

    stop();
    log.info("rpc.stream_opened", { method: "sendPrompt", params: traceParams });
    return res.body;
  }

  async getAvailableModels(): Promise<{ models: WorkerModel[] }> {
    return this.call("getAvailableModels", {});
  }

  async getSessionSnapshot(params: {
    sessionId: string;
    piSessionId?: string;
    project?: string;
    parentSessionId?: string;
  }): Promise<WorkerSessionSnapshot> {
    return this.call("getSessionSnapshot", params);
  }

  async getSubagentSession(params: {
    parentSessionId: string;
    toolCallId: string;
  }): Promise<{ subSessionId: string; subPiSessionId: string }> {
    return this.call("getSubagentSession", params);
  }

  async connectToSession(params: {
    sessionId: string;
    afterSeq: number;
    epoch: string;
    parentSessionId?: string;
    _traceRunId?: string;
  }): Promise<ReadableStream<Uint8Array>> {
    const log = getTraceLogger("bridge");
    const id = ++this.id;
    const traceParams = summarizeWorkerRpcParams("connectToSession", params);
    const stop = log.startTimer("rpc.call", { method: "connectToSession", params: traceParams });

    const body: JsonRpcRequest = {
      jsonrpc: "2.0",
      method: "connectToSession",
      params,
      id,
    };
    const res = await fetch(`${this.baseUrl}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      log.error("rpc.http_error", { method: "connectToSession", params: traceParams, status: res.status });
      stop();
      throw new Error(`Worker request failed: ${res.status}`);
    }
    if (!res.body) {
      log.error("rpc.no_body", { method: "connectToSession", params: traceParams });
      stop();
      throw new Error("Worker response has no body");
    }
    stop();
    log.info("rpc.stream_opened", { method: "connectToSession", params: traceParams });
    return res.body;
  }

  async cancelRun(params: { sessionId: string; _traceRunId?: string }): Promise<{ cancelled: boolean }> {
    return this.call<{ cancelled: boolean }>("cancelRun", params);
  }

  async getSessionStatus(params: { sessionId: string }): Promise<{ running: boolean; piSessionId?: string }> {
    return this.call<{ running: boolean; piSessionId?: string }>("getSessionStatus", params);
  }

  async getSessionModel(params: {
    sessionId: string;
    piSessionId?: string;
    project?: string;
  }): Promise<{ model: { providerId: string; modelId: string } | null }> {
    return this.call<{ model: { providerId: string; modelId: string } | null }>(
      "getSessionModel",
      params,
    );
  }

  async getSessionThinkingLevel(params: {
    sessionId: string;
    piSessionId?: string;
    project?: string;
  }): Promise<{ thinking: { level: string; levels: string[] } | null }> {
    return this.call("getSessionThinkingLevel", params);
  }

  async setSessionThinkingLevel(params: {
    sessionId: string;
    level: string;
    piSessionId?: string;
    project?: string;
  }): Promise<{ thinking: { level: string } | null }> {
    return this.call("setSessionThinkingLevel", params);
  }

  async getSessionSkills(params: {
    sessionId: string;
  }): Promise<{ skills: WorkerSkill[] }> {
    return this.call<{ skills: WorkerSkill[] }>("getSessionSkills", params);
  }

  async getSessionPrompts(params: {
    sessionId: string;
  }): Promise<{ prompts: PromptSummary[] }> {
    return this.call("getSessionPrompts", params);
  }

  async resolvePrompt(params: {
    sessionId: string;
    promptName: string;
    values: Record<string, string>;
  }): Promise<{ text: string }> {
    return this.call("resolvePrompt", params);
  }
}

export function summarizeWorkerRpcParams(method: string, params: unknown): unknown {
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
        defaultThinkingLevel:
          typeof p.defaultThinkingLevel === "string"
            ? p.defaultThinkingLevel
            : undefined,
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
        imageCount: lastContent.filter(
          (c) => (c as { type?: unknown })?.type === "image",
        ).length,
        documentCount: lastContent.filter(
          (c) => (c as { type?: unknown })?.type === "document",
        ).length,
        hasTraceRunId,
      };
    }
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
    case "setSessionThinkingLevel":
      return {
        sessionId,
        level: typeof p.level === "string" ? p.level : undefined,
        hasPiSessionId: typeof p.piSessionId === "string",
        project: typeof p.project === "string" ? p.project : undefined,
      };
    case "getSubagentSession":
      return {
        hasParentSessionId: typeof p.parentSessionId === "string",
        toolCallId: typeof p.toolCallId === "string" ? p.toolCallId : undefined,
      };
    case "cancelRun":
    case "getSessionStatus":
    case "getSessionSkills":
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
