import { getTraceLogger } from "@/lib/features/tracing";

export interface WorkerModel {
  providerId: string;
  modelId: string;
  label: string;
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

export class WorkerClient {
  private baseUrl: string;
  private id = 0;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env.CODING_AGENT_WORKER_URL ?? "http://localhost:3015";
  }

  private async call<T>(method: string, params: unknown): Promise<T> {
    const log = getTraceLogger("bridge");
    const id = ++this.id;
    const stop = log.startTimer("rpc.call", { method, params });

    const body: JsonRpcRequest = { jsonrpc: "2.0", method, params, id };
    const res = await fetch(`${this.baseUrl}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      log.error("rpc.http_error", { method, status: res.status, statusText: res.statusText });
      stop();
      throw new Error(`Worker request failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as JsonRpcResponse<T>;
    if (data.error) {
      log.error("rpc.error", { method, code: data.error.code, message: data.error.message });
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
    piSessionId?: string;
    _traceRunId?: string;
  }): Promise<{ sessionId: string; piSessionId: string }> {
    return this.call("initializeSession", params);
  }

  async sendPrompt(params: {
    sessionId: string;
    prompt: string;
    _traceRunId?: string;
  }): Promise<ReadableStream<Uint8Array>> {
    const log = getTraceLogger("bridge");
    const id = ++this.id;
    const stop = log.startTimer("rpc.call", { method: "sendPrompt", sessionId: params.sessionId });

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
      log.error("rpc.http_error", { method: "sendPrompt", status: res.status, statusText: res.statusText });
      stop();
      throw new Error(`Worker request failed: ${res.status} ${res.statusText}`);
    }

    if (!res.body) {
      log.error("rpc.no_body", { method: "sendPrompt" });
      stop();
      throw new Error("Worker response has no body");
    }

    stop();
    return res.body;
  }

  async getAvailableModels(): Promise<{ models: WorkerModel[] }> {
    return this.call("getAvailableModels", {});
  }

  async setModel(params: { sessionId: string; modelId: string }): Promise<void> {
    await this.call("setModel", params);
  }

  async getSessionMessages(params: {
    sessionId: string;
    piSessionId?: string;
    project?: string;
  }): Promise<{ messages: Array<{ role: string; content: string }> }> {
    return this.call("getSessionMessages", params);
  }

  async disposeSession(params: { sessionId: string }): Promise<void> {
    await this.call("disposeSession", params);
  }
}
