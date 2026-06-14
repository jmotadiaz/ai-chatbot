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
    this.baseUrl = baseUrl ?? process.env.CODING_AGENT_WORKER_URL ?? "http://localhost:9000";
  }

  private async call<T>(method: string, params: unknown): Promise<T> {
    const id = ++this.id;
    const body: JsonRpcRequest = { jsonrpc: "2.0", method, params, id };
    const res = await fetch(`${this.baseUrl}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Worker request failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as JsonRpcResponse<T>;
    if (data.error) {
      throw new Error(`Worker RPC error: ${data.error.message}`);
    }
    return data.result as T;
  }

  async initializeSession(params: {
    userId: string;
    sessionId?: string;
    project: string;
    modelId?: string;
  }): Promise<{ sessionId: string }> {
    return this.call("initializeSession", params);
  }

  async sendPrompt(params: {
    sessionId: string;
    prompt: string;
  }): Promise<ReadableStream<Uint8Array>> {
    const id = ++this.id;
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
      throw new Error(`Worker request failed: ${res.status} ${res.statusText}`);
    }

    if (!res.body) {
      throw new Error("Worker response has no body");
    }

    return res.body;
  }

  async getAvailableModels(): Promise<{ models: WorkerModel[] }> {
    return this.call("getAvailableModels", {});
  }

  async setModel(params: { sessionId: string; modelId: string }): Promise<void> {
    await this.call("setModel", params);
  }

  async disposeSession(params: { sessionId: string }): Promise<void> {
    await this.call("disposeSession", params);
  }
}
