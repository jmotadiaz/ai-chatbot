# Agent Tracing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a decoupled, always-available structured tracing system at `lib/features/tracing/` that covers the worker, bridge, and client layers of the coding agent pipeline, persisting NDJSON traces to `traces/{runId}.ndjson`.

**Architecture:** A standalone `lib/features/tracing/` module with `TraceLogger` (structured JSON logger), `FileTraceSink` (buffered NDJSON writer with cross-process append support), and `TraceContext` (AsyncLocalStorage for per-request scoping). All 3 layers write to the same file per `runId`. Gated by `TRACE_ENABLED=1`. Extends the trace-analyzer skill.

**Tech Stack:** TypeScript, Node.js built-ins (fs/promises, async_hooks), Next.js API routes, React hooks, tsx (for worker process).

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/features/tracing/types.ts` | Create | `TraceEvent`, `LogLevel`, `TraceLayer` types |
| `lib/features/tracing/sink.ts` | Create | `FileTraceSink` — buffered NDJSON writer |
| `lib/features/tracing/context.ts` | Create | `AsyncLocalStorage` context + `getTraceLogger` factory |
| `lib/features/tracing/logger.ts` | Create | `TraceLogger` — info/warn/error/startTimer |
| `lib/features/tracing/index.ts` | Create | Barrel exports + `isTracingEnabled()` |
| `lib/features/tracing/inspector.ts` | Create | CLI: list, show, errors, layer, stats |
| `app/(chat)/api/agent/code/route.ts` | Modify | Wrap handler with trace context + logging |
| `lib/features/agent-code/worker-client.ts` | Modify | Log fetch calls + RPC errors |
| `lib/features/agent-code/pi-to-agui-translator.ts` | Modify | Log event translations |
| `lib/agent-code/worker.ts` | Modify | Init trace logger per request |
| `lib/agent-code/rpc-server.ts` | Modify | Log RPC method calls + results/timings |
| `lib/agent-code/session-manager.ts` | Modify | Log session lifecycle + Pi events |
| `lib/features/agent-code/actions.ts` | Modify | Log server action calls |
| `app/(chat)/api/agent/code/trace/route.ts` | Create | Client event endpoint |
| `lib/features/agent-code/hooks/use-coding-agent.ts` | Modify | POST client events to trace endpoint |
| `.agents/skills/trace-analyzer/SKILL.md` | Modify | Add coding agent trace analysis section |

---

### Task 1: Create `lib/features/tracing/types.ts`

**Files:**
- Create: `lib/features/tracing/types.ts`

- [ ] **Step 1: Write types file**

```typescript
export type LogLevel = "debug" | "info" | "warn" | "error";

export type TraceLayer = "worker" | "bridge" | "client";

export interface TraceEvent {
  ts: string;
  runId: string;
  layer: TraceLayer;
  sessionId?: string;
  level: LogLevel;
  event: string;
  durationMs?: number;
  payload: unknown;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/features/tracing/types.ts
git commit -m "feat(tracing): add TraceEvent types"
```

---

### Task 2: Create `lib/features/tracing/sink.ts`

**Files:**
- Create: `lib/features/tracing/sink.ts`

- [ ] **Step 1: Write FileTraceSink**

```typescript
import "server-only";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { TraceEvent } from "./types";

const DEFAULT_TRACE_DIR = "traces";
const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_BUFFER_SIZE = 20;

export interface FileTraceSinkOptions {
  traceDir?: string;
  runId: string;
  /** If true, file is truncated on open. Default true. Set false for worker processes appending to existing file. */
  truncate?: boolean;
}

export class FileTraceSink {
  private readonly filePath: string;
  private readonly truncate: boolean;
  private readonly flushIntervalMs: number;
  private readonly flushBufferSize: number;
  private buffer: TraceEvent[] = [];
  private flushing: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(opts: FileTraceSinkOptions) {
    const traceDir =
      opts.traceDir ?? process.env.TRACE_DIR ?? DEFAULT_TRACE_DIR;
    this.filePath = resolve(traceDir, `${opts.runId}.ndjson`);
    this.truncate = opts.truncate ?? true;
    this.flushIntervalMs = FLUSH_INTERVAL_MS;
    this.flushBufferSize = FLUSH_BUFFER_SIZE;
  }

  async open(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    if (this.truncate) {
      await writeFile(this.filePath, "", { flag: "w" });
    }
    this.timer = setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  write(event: TraceEvent): void {
    if (this.closed) return;
    this.buffer.push(event);
    if (this.buffer.length >= this.flushBufferSize) {
      void this.flush();
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  private async flush(): Promise<void> {
    if (this.flushing) {
      await this.flushing;
      return;
    }
    if (this.buffer.length === 0) return;

    const toWrite = this.buffer;
    this.buffer = [];
    this.flushing = this.writeBuffer(toWrite).finally(() => {
      this.flushing = null;
    });
    await this.flushing;
  }

  private async writeBuffer(events: TraceEvent[]): Promise<void> {
    if (events.length === 0) return;
    const line =
      events.map((e) => JSON.stringify(e)).join("\n") + "\n";
    try {
      await appendFile(this.filePath, line, "utf8");
    } catch (err) {
      console.error("[trace] sink write failed:", err);
    }
  }

  getFilePath(): string {
    return this.filePath;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/features/tracing/sink.ts
git commit -m "feat(tracing): add FileTraceSink with cross-process append support"
```

---

### Task 3: Create `lib/features/tracing/context.ts`

**Files:**
- Create: `lib/features/tracing/context.ts`

- [ ] **Step 1: Write TraceContext with AsyncLocalStorage**

```typescript
import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { FileTraceSink } from "./sink";

export interface TraceContext {
  runId: string;
  sessionId?: string;
  sink: FileTraceSink | null;
}

const storage = new AsyncLocalStorage<TraceContext>();

export function runWithTraceContext<T>(
  ctx: TraceContext,
  fn: () => Promise<T> | T,
): Promise<T> | T {
  return storage.run(ctx, fn);
}

export function getTraceContext(): TraceContext | undefined {
  return storage.getStore();
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/features/tracing/context.ts
git commit -m "feat(tracing): add AsyncLocalStorage TraceContext"
```

---

### Task 4: Create `lib/features/tracing/logger.ts`

**Files:**
- Create: `lib/features/tracing/logger.ts`

- [ ] **Step 1: Write TraceLogger class**

```typescript
import "server-only";
import { getTraceContext } from "./context";
import { isTracingEnabled } from "./index";
import type { FileTraceSink } from "./sink";
import type { TraceLayer, LogLevel } from "./types";

export class TraceLogger {
  private layer: TraceLayer;
  private sink: FileTraceSink | null;

  constructor(layer: TraceLayer, sink: FileTraceSink | null) {
    this.layer = layer;
    this.sink = sink;
  }

  private write(
    level: LogLevel,
    event: string,
    payload?: unknown,
    durationMs?: number,
  ): void {
    if (!isTracingEnabled() || !this.sink) return;
    const ctx = getTraceContext();
    this.sink.write({
      ts: new Date().toISOString(),
      runId: ctx?.runId ?? "unknown",
      layer: this.layer,
      sessionId: ctx?.sessionId,
      level,
      event,
      durationMs,
      payload,
    });
  }

  debug(event: string, payload?: unknown): void {
    this.write("debug", event, payload);
  }

  info(event: string, payload?: unknown): void {
    this.write("info", event, payload);
  }

  warn(event: string, payload?: unknown): void {
    this.write("warn", event, payload);
  }

  error(event: string, payload?: unknown): void {
    this.write("error", event, payload);
  }

  /** Returns a stop function that logs `{event}_end` with durationMs. */
  startTimer(event: string, payload?: unknown): () => void {
    const start = Date.now();
    return () => {
      this.write("info", `${event}_end`, payload, Date.now() - start);
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/features/tracing/logger.ts
git commit -m "feat(tracing): add TraceLogger with info/warn/error/startTimer"
```

---

### Task 5: Create `lib/features/tracing/index.ts`

**Files:**
- Create: `lib/features/tracing/index.ts`

- [ ] **Step 1: Write barrel + isTracingEnabled + getTraceLogger**

```typescript
import { getTraceContext } from "./context";
import { TraceLogger } from "./logger";
import type { TraceLayer } from "./types";

export type { TraceEvent, LogLevel, TraceLayer } from "./types";
export type { FileTraceSink, FileTraceSinkOptions } from "./sink";
export { FileTraceSink } from "./sink";
export { TraceLogger } from "./logger";
export { runWithTraceContext, getTraceContext, type TraceContext } from "./context";

export function isTracingEnabled(): boolean {
  return process.env.TRACE_ENABLED === "1";
}

/**
 * Get a TraceLogger scoped to the current AsyncLocalStorage context.
 * Creates a logger bound to the layer and the sink stored in context.
 * Returns a noop-like logger when tracing is disabled.
 */
export function getTraceLogger(layer: TraceLayer): TraceLogger {
  const ctx = getTraceContext();
  return new TraceLogger(layer, ctx?.sink ?? null);
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/features/tracing/index.ts
git commit -m "feat(tracing): add barrel exports, isTracingEnabled, getTraceLogger"
```

---

### Task 6: Integrate tracing into API route

**Files:**
- Modify: `app/(chat)/api/agent/code/route.ts:1-92`

- [ ] **Step 1: Add imports and wrap handler with trace context**

Key: create the `runId` and `FileTraceSink` early, before `runWithTraceContext`, so all log calls (request.start, db.lookup, etc.) already have a sink.

Replace the full file content:

```typescript
import { EventType } from "@ag-ui/client";
import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { WorkerClient } from "@/lib/features/agent-code/worker-client";
import { translatePiEvent } from "@/lib/features/agent-code/pi-to-agui-translator";
import { getSession, touchSession } from "@/lib/features/agent-code/session-store";
import { toPiModelId } from "@/lib/features/agent-code/model-mapping";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import {
  FileTraceSink,
  isTracingEnabled,
  runWithTraceContext,
  getTraceLogger,
} from "@/lib/features/tracing";

export const maxDuration = 240;

export const POST = withAuth(async (user, req) => {
  const body = await req.json();
  const threadId = body.threadId as string;
  const forwardedProps = (body.forwardedProps as Record<string, string>) ?? {};
  const project = forwardedProps.project;
  const sessionId = forwardedProps.sessionId ?? threadId;
  const modelId = forwardedProps.modelId;
  const messages = body.messages as Array<{ role: string; content: string }>;

  const runId = crypto.randomUUID();
  const sink = isTracingEnabled() ? new FileTraceSink({ runId }) : null;
  await sink?.open();

  try {
    return await runWithTraceContext({ runId, sessionId, sink }, async () => {
      const log = getTraceLogger("bridge");
      log.info("request.start", { threadId, sessionId, project, modelId, messageCount: messages.length });

      const dbSession = await getSession({ userId: user.id, sessionId });
      log.info("db.lookup", { found: !!dbSession, sessionId });
      if (!dbSession) {
        return new Response("Session not found", { status: 404 });
      }

      const client = new WorkerClient();

      const piModelId = modelId ? toPiModelId(modelId as chatModelId) : undefined;
      log.info("model.mapping", { from: modelId, to: piModelId });

      const initStop = log.startTimer("worker.initialize");
      await client.initializeSession({
        userId: user.id,
        sessionId,
        project,
        modelId: piModelId ? `${piModelId.providerId}/${piModelId.modelId}` : undefined,
        _traceRunId: runId,
      });
      initStop();

      const prompt = messages[messages.length - 1]?.content ?? "";
      const sendStop = log.startTimer("worker.sendPrompt", { promptLength: prompt.length });
      const workerStream = await client.sendPrompt({ sessionId, prompt, _traceRunId: runId });
      sendStop();

      await touchSession({ userId: user.id, sessionId });

      log.info("stream.start");
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const reader = workerStream.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";

              for (const line of lines) {
                if (!line.trim()) continue;
                try {
                  const piEvent = JSON.parse(line);
                  const aguiEvent = translatePiEvent(piEvent, {
                    threadId: sessionId,
                    runId,
                  });
                  log.debug("stream.event", { piType: piEvent.type, aguiType: aguiEvent.type });
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(aguiEvent)}\n\n`));
                } catch {
                  log.warn("stream.malformed", { line: line.slice(0, 500) });
                }
              }
            }
          } catch (err) {
            log.error("stream.error", { message: String(err) });
            const errorEvent = {
              type: EventType.RUN_ERROR,
              threadId: sessionId,
              runId,
              message: String(err),
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
          } finally {
            log.info("stream.close");
            controller.close();
          }
        },
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
  } finally {
    await sink?.close();
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add app/\(chat\)/api/agent/code/route.ts
git commit -m "feat(tracing): integrate tracer into agent code API route"
```

---

### Task 7: Integrate tracing into WorkerClient

**Files:**
- Modify: `lib/features/agent-code/worker-client.ts:21-97`

- [ ] **Step 1: Add trace logging to WorkerClient**

Replace the file with tracing throughout:

```typescript
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
      throw new Error(`Worker request failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as JsonRpcResponse<T>;
    if (data.error) {
      log.error("rpc.error", { method, code: data.error.code, message: data.error.message });
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
  }): Promise<{ sessionId: string }> {
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
      throw new Error(`Worker request failed: ${res.status} ${res.statusText}`);
    }

    if (!res.body) {
      log.error("rpc.no_body", { method: "sendPrompt" });
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

  async disposeSession(params: { sessionId: string }): Promise<void> {
    await this.call("disposeSession", params);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/features/agent-code/worker-client.ts
git commit -m "feat(tracing): add trace logging to WorkerClient RPC calls"
```

---

### Task 8: Integrate tracing into Pi-to-AG-UI translator

**Files:**
- Modify: `lib/features/agent-code/pi-to-agui-translator.ts:24-100`

- [ ] **Step 1: Add trace logging to translatePiEvent**

Replace the `translatePiEvent` function with:

```typescript
import { EventType, type BaseEvent } from "@ag-ui/client";
import { getTraceLogger } from "@/lib/features/tracing";

type PiEvent =
  | { type: "agent_start" }
  | { type: "agent_end" }
  | { type: "message_start"; messageId?: string }
  | { type: "message_end"; messageId?: string }
  | {
      type: "message_update";
      assistantMessageEvent:
        | { type: "text_delta"; delta: string }
        | { type: "thinking_delta"; delta: string };
    }
  | { type: "tool_execution_start"; toolName: string; toolCallId?: string }
  | { type: "tool_execution_update"; toolCallId?: string; output?: string }
  | {
      type: "tool_execution_end";
      toolCallId?: string;
      isError?: boolean;
      result?: unknown;
    }
  | { type: "error"; message: string };

export function translatePiEvent(
  piEvent: PiEvent,
  context: { threadId: string; runId: string },
): BaseEvent {
  const log = getTraceLogger("bridge");
  const { threadId, runId } = context;

  let result: BaseEvent;

  switch (piEvent.type) {
    case "agent_start":
      result = {
        type: EventType.RUN_STARTED,
        threadId,
        runId,
        timestamp: Date.now(),
      } as BaseEvent;
      break;
    case "agent_end":
      result = {
        type: EventType.RUN_FINISHED,
        threadId,
        runId,
        timestamp: Date.now(),
      } as BaseEvent;
      break;
    case "message_start":
      result = {
        type: EventType.TEXT_MESSAGE_START,
        messageId: piEvent.messageId ?? "msg-1",
        role: "assistant",
        timestamp: Date.now(),
      } as BaseEvent;
      break;
    case "message_update":
      if (piEvent.assistantMessageEvent.type === "text_delta") {
        result = {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: "msg-1",
          delta: piEvent.assistantMessageEvent.delta,
          timestamp: Date.now(),
        } as BaseEvent;
      } else {
        result = { type: EventType.RAW, payload: piEvent } as BaseEvent;
      }
      break;
    case "message_end":
      result = {
        type: EventType.TEXT_MESSAGE_END,
        messageId: piEvent.messageId ?? "msg-1",
        timestamp: Date.now(),
      } as BaseEvent;
      break;
    case "tool_execution_start":
      result = {
        type: EventType.TOOL_CALL_START,
        toolCallId: piEvent.toolCallId ?? "tool-1",
        toolCallName: piEvent.toolName,
        timestamp: Date.now(),
      } as BaseEvent;
      break;
    case "tool_execution_update":
      result = {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: piEvent.toolCallId ?? "tool-1",
        args: piEvent.output ?? "",
        timestamp: Date.now(),
      } as BaseEvent;
      break;
    case "tool_execution_end":
      result = {
        type: EventType.TOOL_CALL_RESULT,
        messageId: "msg-1",
        toolCallId: piEvent.toolCallId ?? "tool-1",
        content: piEvent.result ?? "",
        timestamp: Date.now(),
      } as BaseEvent;
      break;
    case "error":
      result = {
        type: EventType.RUN_ERROR,
        threadId,
        runId,
        message: piEvent.message,
        timestamp: Date.now(),
      } as BaseEvent;
      break;
    default:
      log.debug("translate.unknown_type", { piType: (piEvent as { type: string }).type });
      result = { type: EventType.RAW, payload: piEvent } as BaseEvent;
  }

  log.debug("translate", { piType: piEvent.type, aguiType: result.type });
  return result;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/features/agent-code/pi-to-agui-translator.ts
git commit -m "feat(tracing): add trace logging to Pi-AGUI event translator"
```

---

### Task 9: Integrate tracing into Worker process

**Files:**
- Modify: `lib/agent-code/worker.ts:1-40`
- Modify: `lib/agent-code/rpc-server.ts:1-81`
- Modify: `lib/agent-code/session-manager.ts:1-148`

The worker process imports tracing code directly from `lib/features/tracing/` (same project, compiled by `tsx`). It uses `truncate: false` on the sink to avoid wiping bridge-written events. The `runId` is extracted from JSON-RPC params (passed by the bridge).

- [ ] **Step 1: Modify `worker.ts` — extract runId from RPC body and wrap handler**

Replace `worker.ts`:

```typescript
import { createServer } from "node:http";
import { handleRpc } from "./rpc-server";
import { FileTraceSink, isTracingEnabled, runWithTraceContext } from "@/lib/features/tracing";

const port = parseInt(process.env.CODING_AGENT_WORKER_PORT ?? "3015", 10);

const server = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/rpc") {
    res.writeHead(404).end("Not found");
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString("utf-8");

  let runId: string;
  try {
    const parsed = JSON.parse(body) as { params?: { _traceRunId?: string } };
    runId = parsed.params?._traceRunId ?? crypto.randomUUID();
  } catch {
    runId = crypto.randomUUID();
  }

  const sink = isTracingEnabled() ? new FileTraceSink({ runId, truncate: false }) : null;
  await sink?.open();
  try {
    const response = await runWithTraceContext({ runId, sink }, () =>
      handleRpc(body),
    );
    res.writeHead(
      response.status,
      Object.fromEntries(response.headers.entries()),
    );
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    res.end();
  } finally {
    await sink?.close();
  }
});

server.listen(port, () => {
  console.log(`Coding agent worker listening on http://localhost:${port}`);
});
```

- [ ] **Step 2: Modify `rpc-server.ts` — add tracing to RPC handler**

Replace `rpc-server.ts`:

```typescript
import {
  getOrCreateSession,
  sendPrompt,
  getAvailableModels,
  disposeSession,
} from "./session-manager";
import { getTraceLogger } from "@/lib/features/tracing";

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
          },
        );
        break;
      }
      case "sendPrompt": {
        const { sessionId, prompt } = params as {
          sessionId: string;
          prompt: string;
        };
        const stream = await sendPrompt(sessionId, prompt);
        stop();
        return new Response(stream, {
          headers: { "Content-Type": "application/x-ndjson" },
        });
      }
      case "getAvailableModels": {
        result = { models: await getAvailableModels() };
        break;
      }
      case "disposeSession": {
        const { sessionId } = params as { sessionId: string };
        await disposeSession(sessionId);
        result = null;
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
```

- [ ] **Step 3: Modify `session-manager.ts` — add tracing to session methods**

Replace `session-manager.ts`:

```typescript
import path from "node:path";
import {
  createAgentSessionRuntime,
  createAgentSessionFromServices,
  createAgentSessionServices,
  getAgentDir,
  SessionManager,
  AuthStorage,
  ModelRegistry,
  type CreateAgentSessionRuntimeFactory,
} from "@earendil-works/pi-coding-agent";
import { getTraceLogger } from "@/lib/features/tracing";

interface SessionEntry {
  sessionId: string;
  project: string;
  runtime: Awaited<ReturnType<typeof createAgentSessionRuntime>>;
}

const sessions = new Map<string, SessionEntry>();

function isValidProjectName(name: string): boolean {
  if (
    !name ||
    name.includes("/") ||
    name.includes("\\") ||
    name === "." ||
    name === ".."
  ) {
    return false;
  }
  return /^[a-zA-Z0-9_.-]+$/.test(name);
}

function resolveProjectPath(root: string, project: string): string {
  if (!isValidProjectName(project)) {
    throw new Error("Invalid project name");
  }
  return path.resolve(root, project);
}

export async function getOrCreateSession(options: {
  userId: string;
  project: string;
  sessionId?: string;
  modelId?: string;
}): Promise<{ sessionId: string }> {
  const log = getTraceLogger("worker");
  const existing = options.sessionId
    ? sessions.get(options.sessionId)
    : undefined;

  if (existing && existing.project === options.project) {
    log.info("session.reuse", { sessionId: existing.sessionId });
    if (options.modelId) {
      const model = existing.runtime.session.model;
      if (model && `${model.provider}/${model.id}` !== options.modelId) {
        // TODO: call setModel on the session if Pi SDK supports it
      }
    }
    return { sessionId: existing.sessionId };
  }

  const sessionId = options.sessionId ?? crypto.randomUUID();
  const projectsRoot = process.env.CODING_AGENT_PROJECTS_ROOT!;
  const cwd = resolveProjectPath(projectsRoot, options.project);

  log.info("session.create", { sessionId, project: options.project, modelId: options.modelId });

  const createRuntime: CreateAgentSessionRuntimeFactory = async ({
    cwd: runtimeCwd,
    sessionManager,
    sessionStartEvent,
  }) => {
    const services = await createAgentSessionServices({ cwd: runtimeCwd });
    return {
      ...(await createAgentSessionFromServices({
        services,
        sessionManager,
        sessionStartEvent,
      })),
      services,
      diagnostics: services.diagnostics,
    };
  };

  const stop = log.startTimer("session.runtime_create");
  const runtime = await createAgentSessionRuntime(createRuntime, {
    cwd,
    agentDir: getAgentDir(),
    sessionManager: SessionManager.create(process.env.CODING_AGENT_SESSIONS_DIR!),
  });
  stop();

  sessions.set(sessionId, { sessionId, project: options.project, runtime });
  return { sessionId };
}

export async function sendPrompt(
  sessionId: string,
  prompt: string,
): Promise<ReadableStream<Uint8Array>> {
  const log = getTraceLogger("worker");
  const entry = sessions.get(sessionId);
  if (!entry) {
    log.error("session.not_found", { sessionId });
    throw new Error("Session not found");
  }

  log.info("session.prompt", { sessionId, promptLength: prompt.length });
  const { runtime } = entry;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const unsubscribe = runtime.session.subscribe((event) => {
        log.debug("pi.event", { type: event.type });
        const line = JSON.stringify(event) + "\n";
        controller.enqueue(encoder.encode(line));
      });

      const promptStop = log.startTimer("session.prompt_execution");
      runtime.session
        .prompt(prompt)
        .then(() => {
          promptStop();
          log.info("session.prompt_complete", { sessionId });
          controller.close();
          unsubscribe();
        })
        .catch((err) => {
          promptStop();
          log.error("session.prompt_error", { sessionId, message: String(err) });
          controller.error(err);
          unsubscribe();
        });
    },
  });

  return stream;
}

export async function getAvailableModels(): Promise<
  Array<{ providerId: string; modelId: string; label: string }>
> {
  const log = getTraceLogger("worker");
  log.info("models.fetch");

  const authStorage = AuthStorage.create(process.env.CODING_AGENT_AUTH_JSON);
  const registry = ModelRegistry.create(authStorage);
  const available = await registry.getAvailable();
  const filtered = available
    .filter((model) => model.provider === "opencodeGo")
    .map((model) => ({
      providerId: model.provider,
      modelId: model.id,
      label: `${model.provider}/${model.id}`,
    }));

  log.info("models.result", { count: filtered.length });
  return filtered;
}

export async function disposeSession(sessionId: string): Promise<void> {
  const log = getTraceLogger("worker");
  const entry = sessions.get(sessionId);
  if (entry) {
    log.info("session.dispose", { sessionId });
    entry.runtime.session.dispose();
    sessions.delete(sessionId);
  } else {
    log.warn("session.dispose_not_found", { sessionId });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/agent-code/worker.ts lib/agent-code/rpc-server.ts lib/agent-code/session-manager.ts
git commit -m "feat(tracing): integrate tracer into worker process"
```

---

### Task 10: Integrate tracing into server actions

**Files:**
- Modify: `lib/features/agent-code/actions.ts:1-57`

Server actions run outside `runWithTraceContext`. Each action creates its own short-lived `FileTraceSink` via a `withActionTrace` helper that wraps the action body. Traces land in `traces/actions/{runId}.ndjson`.

- [ ] **Step 1: Add trace logging with per-action sink wrapper**

Replace `actions.ts`:

```typescript
"use server";

import { listProjects } from "./project-resolver";
import {
  createSession,
  listSessions,
  getSession,
} from "./session-store";
import { filterAvailableChatModels } from "./model-mapping";
import { WorkerClient } from "./worker-client";
import { auth } from "@/lib/features/auth/auth-config";
import {
  FileTraceSink,
  isTracingEnabled,
  runWithTraceContext,
  getTraceLogger,
} from "@/lib/features/tracing";

function assertEnabled() {
  if (process.env.CODING_AGENT_ENABLED !== "true") {
    throw new Error("Coding agent is not enabled");
  }
}

async function getUserId() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return session.user.id;
}

async function withActionTrace<T>(
  action: string,
  fn: (log: ReturnType<typeof getTraceLogger>) => Promise<T>,
): Promise<T> {
  if (!isTracingEnabled()) {
    const noop = getTraceLogger("client");
    return fn(noop);
  }
  const runId = crypto.randomUUID();
  const sink = new FileTraceSink({ runId });
  await sink.open();
  try {
    return await runWithTraceContext({ runId, sink }, async () => {
      const log = getTraceLogger("client");
      log.info("action.call", { action });
      const stop = log.startTimer("action.duration");
      try {
        return await fn(log);
      } finally {
        stop();
      }
    });
  } finally {
    await sink.close();
  }
}

export async function getCodingAgentProjects() {
  return withActionTrace("getCodingAgentProjects", async (log) => {
    assertEnabled();
    const root = process.env.CODING_AGENT_PROJECTS_ROOT;
    if (!root) return [];
    const result = listProjects(root);
    log.info("action.result", { count: result.length });
    return result;
  });
}

export async function getCodingAgentSessions(project: string) {
  return withActionTrace("getCodingAgentSessions", async (log) => {
    assertEnabled();
    const userId = await getUserId();
    const result = listSessions({ userId, project });
    log.info("action.result", { count: result.length });
    return result;
  });
}

export async function createCodingAgentSession(project: string, modelId?: string) {
  return withActionTrace("createCodingAgentSession", async (log) => {
    assertEnabled();
    const userId = await getUserId();
    const result = createSession({ userId, project, modelId });
    log.info("action.result", { sessionId: result.sessionId });
    return result;
  });
}

export async function getCodingAgentSession(project: string, sessionId: string) {
  return withActionTrace("getCodingAgentSession", async (log) => {
    assertEnabled();
    const userId = await getUserId();
    return getSession({ userId, sessionId });
  });
}

export async function getCodingAgentModels() {
  return withActionTrace("getCodingAgentModels", async (log) => {
    assertEnabled();
    const client = new WorkerClient();
    const { models } = await client.getAvailableModels();
    const result = filterAvailableChatModels(models);
    log.info("action.result", { count: result.length });
    return result;
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/features/agent-code/actions.ts
git commit -m "feat(tracing): add trace logging to server actions"
```

---

### Task 11: Create client trace endpoint

**Files:**
- Create: `app/(chat)/api/agent/code/trace/route.ts`

- [ ] **Step 1: Write client trace endpoint**

```typescript
import { FileTraceSink, isTracingEnabled } from "@/lib/features/tracing";
import type { LogLevel } from "@/lib/features/tracing";

export async function POST(req: Request) {
  if (!isTracingEnabled()) {
    return new Response(null, { status: 204 });
  }

  const body = await req.json() as {
    runId: string;
    sessionId?: string;
    event: string;
    level: LogLevel;
    payload?: unknown;
  };

  const sink = new FileTraceSink({ runId: body.runId, truncate: false });
  await sink.open();

  sink.write({
    ts: new Date().toISOString(),
    runId: body.runId,
    layer: "client",
    sessionId: body.sessionId,
    level: body.level,
    event: body.event,
    payload: body.payload,
  });

  await sink.close();
  return new Response(null, { status: 201 });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(chat\)/api/agent/code/trace/route.ts
git commit -m "feat(tracing): add client trace endpoint for browser events"
```

---

### Task 12: Integrate tracing into useCodingAgent hook

**Files:**
- Modify: `lib/features/agent-code/hooks/use-coding-agent.ts:18-74`

- [ ] **Step 1: Add client-side trace event posting**

Replace the `useCodingAgent` function body (keeping imports and types unchanged):

```typescript
"use client";

import { useMemo, useState, useCallback } from "react";
import { HttpAgent, EventType, type BaseEvent } from "@ag-ui/client";

export interface UseCodingAgentArgs {
  project: string;
  sessionId: string;
  modelId: string;
}

export interface UseCodingAgentResult {
  messages: Array<{ role: string; content: string }>;
  isRunning: boolean;
  sendMessage: (content: string) => Promise<void>;
}

async function postTraceEvent(runId: string, sessionId: string, event: string, level: string, payload?: unknown) {
  try {
    await fetch("/api/agent/code/trace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, sessionId, event, level, payload }),
    });
  } catch {
    // trace failure is non-fatal
  }
}

export function useCodingAgent({
  project,
  sessionId,
  modelId,
}: UseCodingAgentArgs): UseCodingAgentResult {
  const agent = useMemo(
    () =>
      new HttpAgent({
        url: "/api/agent/code",
        threadId: sessionId,
      }),
    [sessionId],
  );

  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [isRunning, setIsRunning] = useState(false);

  const sendMessage = useCallback(
    async (content: string) => {
      const runId = crypto.randomUUID();
      postTraceEvent(runId, sessionId, "sendMessage", "info", { contentLength: content.length });

      setMessages((prev) => [...prev, { role: "user", content }]);
      setIsRunning(true);

      let assistantContent = "";

      agent.addMessage({ id: crypto.randomUUID(), role: "user", content });

      await agent.runAgent(
        {
          runId,
          forwardedProps: {
            project,
            sessionId,
            modelId,
          },
        },
        {
          onEvent: ({ event }: { event: BaseEvent }) => {
            postTraceEvent(runId, sessionId, "event.received", "debug", {
              type: event.type,
            });
            if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
              assistantContent += (event as unknown as { delta: string }).delta;
            }
          },
          onRunFailed: () => {
            postTraceEvent(runId, sessionId, "run.failed", "error");
            setIsRunning(false);
          },
          onRunFinalized: () => {
            postTraceEvent(runId, sessionId, "run.finalized", "info", {
              contentLength: assistantContent.length,
            });
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: assistantContent },
            ]);
            setIsRunning(false);
          },
        },
      );
    },
    [agent, project, sessionId, modelId],
  );

  return { messages, isRunning, sendMessage };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/features/agent-code/hooks/use-coding-agent.ts
git commit -m "feat(tracing): add client-side trace event posting to useCodingAgent hook"
```

---

### Task 13: Create trace inspector CLI

**Files:**
- Create: `lib/features/tracing/inspector.ts`

- [ ] **Step 1: Write inspector CLI**

```typescript
#!/usr/bin/env npx tsx
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, basename } from "node:path";
import type { TraceEvent, TraceLayer, LogLevel } from "./types";

const TRACE_DIR = process.env.TRACE_DIR ?? "traces";

async function listTraceFiles(): Promise<string[]> {
  try {
    const entries = await readdir(TRACE_DIR);
    return entries
      .filter((f) => f.endsWith(".ndjson"))
      .sort((a, b) => b.localeCompare(a));
  } catch {
    return [];
  }
}

async function readTraceFile(runId: string): Promise<TraceEvent[]> {
  const filePath = resolve(TRACE_DIR, `${runId}.ndjson`);
  const content = await readFile(filePath, "utf-8");
  return content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as TraceEvent);
}

function formatEvent(e: TraceEvent): string {
  const ts = e.ts.slice(11, 23); // HH:MM:SS.mmm
  const layer = e.layer.padEnd(7);
  const level = e.level.toUpperCase().padEnd(5);
  const dur = e.durationMs != null ? ` (${e.durationMs}ms)` : "";
  return `${ts} [${layer}] ${level} ${e.event}${dur}`;
}

const command = process.argv[2];
const argId = process.argv[3];

async function main() {
  switch (command) {
    case "list": {
      const files = await listTraceFiles();
      if (files.length === 0) {
        console.log("No trace files found in", resolve(TRACE_DIR));
        return;
      }

      console.log(`Trace files in ${resolve(TRACE_DIR)}:\n`);
      for (const file of files) {
        const fp = resolve(TRACE_DIR, file);
        const s = await stat(fp);
        const runId = basename(file, ".ndjson");
        const sizeKB = (s.size / 1024).toFixed(1);
        const mtime = s.mtime.toISOString().slice(0, 19).replace("T", " ");
        console.log(`  ${runId}  ${sizeKB}KB  ${mtime}`);
      }
      break;
    }

    case "show": {
      if (!argId) {
        console.log("Usage: inspector.ts show <runId>");
        return;
      }
      const events = await readTraceFile(argId);
      console.log(`Run: ${argId} (${events.length} events)\n`);
      for (const e of events) {
        console.log(formatEvent(e));
        if (e.payload !== undefined) {
          console.log(`       ${JSON.stringify(e.payload).slice(0, 200)}`);
        }
      }
      break;
    }

    case "errors": {
      if (!argId) {
        console.log("Usage: inspector.ts errors <runId>");
        return;
      }
      const events = await readTraceFile(argId);
      const errors = events.filter((e) => e.level === "error" || e.level === "warn");
      console.log(`Errors/warnings in ${argId} (${errors.length}):\n`);
      for (const e of errors) {
        console.log(formatEvent(e));
        if (e.payload !== undefined) {
          console.log(`       ${JSON.stringify(e.payload).slice(0, 500)}`);
        }
      }
      break;
    }

    case "layer": {
      const wantedLayer = argId as TraceLayer;
      const runId = process.argv[4];
      if (!wantedLayer || !runId) {
        console.log("Usage: inspector.ts layer <worker|bridge|client> <runId>");
        return;
      }
      const events = await readTraceFile(runId);
      const filtered = events.filter((e) => e.layer === wantedLayer);
      console.log(`Layer ${wantedLayer} in ${runId} (${filtered.length} events):\n`);
      for (const e of filtered) {
        console.log(formatEvent(e));
        if (e.payload !== undefined) {
          console.log(`       ${JSON.stringify(e.payload).slice(0, 300)}`);
        }
      }
      break;
    }

    case "stats": {
      if (!argId) {
        console.log("Usage: inspector.ts stats <runId>");
        return;
      }
      const events = await readTraceFile(argId);
      const byLayer: Record<string, number> = {};
      const byLevel: Record<string, number> = {};
      const byEvent: Record<string, number> = {};
      let totalDuration = 0;
      let maxDur = 0;
      let maxDurEvent = "";

      for (const e of events) {
        byLayer[e.layer] = (byLayer[e.layer] ?? 0) + 1;
        byLevel[e.level] = (byLevel[e.level] ?? 0) + 1;
        byEvent[e.event] = (byEvent[e.event] ?? 0) + 1;
        if (e.durationMs != null) {
          totalDuration += e.durationMs;
          if (e.durationMs > maxDur) {
            maxDur = e.durationMs;
            maxDurEvent = e.event;
          }
        }
      }

      console.log(`Stats for ${argId} (${events.length} events):\n`);
      console.log("By layer:");
      for (const [l, c] of Object.entries(byLayer)) console.log(`  ${l}: ${c}`);
      console.log("\nBy level:");
      for (const [l, c] of Object.entries(byLevel)) console.log(`  ${l}: ${c}`);
      console.log(`\nTotal timed duration: ${totalDuration}ms`);
      console.log(`Slowest: ${maxDurEvent} (${maxDur}ms)`);
      console.log("\nBy event:");
      for (const [ev, c] of Object.entries(byEvent).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${ev}: ${c}`);
      }
      break;
    }

    default:
      console.log("Usage: npx tsx lib/features/tracing/inspector.ts <command> [args]");
      console.log("Commands:");
      console.log("  list                          List recent trace files");
      console.log("  show <runId>                  Show all events chronologically");
      console.log("  errors <runId>                Show only error/warn events");
      console.log("  layer <worker|bridge|client> <runId>  Show layer-specific events");
      console.log("  stats <runId>                 Event counts, durations, errors by layer");
  }
}

main().catch(console.error);
```

- [ ] **Step 2: Commit**

```bash
git add lib/features/tracing/inspector.ts
git commit -m "feat(tracing): add trace inspector CLI"
```

---

### Task 14: Extend trace-analyzer skill

**Files:**
- Modify: `.agents/skills/trace-analyzer/SKILL.md`

- [ ] **Step 1: Append coding agent trace analysis section to skill**

Append to SKILL.md after the "Common Patterns" section:

```markdown

## Coding Agent Trace Analysis

When analyzing coding agent issues, use the trace inspector to examine the full request lifecycle across all 3 layers (worker, bridge, client).

### Inspector Commands

```bash
# List recent trace files
npx tsx lib/features/tracing/inspector.ts list

# Show full trace for a runId (all layers, chronological)
npx tsx lib/features/tracing/inspector.ts show <runId>

# Show only errors/warnings for a run
npx tsx lib/features/tracing/inspector.ts errors <runId>

# Show layer-specific events
npx tsx lib/features/tracing/inspector.ts layer worker <runId>
npx tsx lib/features/tracing/inspector.ts layer bridge <runId>
npx tsx lib/features/tracing/inspector.ts layer client <runId>

# Show aggregate stats
npx tsx lib/features/tracing/inspector.ts stats <runId>
```

### Trace Event Schema

```typescript
interface TraceEvent {
  ts: string;           // ISO 8601 timestamp
  runId: string;        // UUID correlating all layers
  layer: "worker" | "bridge" | "client";
  sessionId?: string;
  level: "debug" | "info" | "warn" | "error";
  event: string;        // e.g. "rpc.request", "stream.event", "run.failed"
  durationMs?: number;  // for paired start/end events
  payload: unknown;
}
```

### Analysis Workflow for Coding Agent

1. **List traces**: `npx tsx lib/features/tracing/inspector.ts list` — find the relevant runId
2. **Check errors first**: `npx tsx lib/features/tracing/inspector.ts errors <runId>` — any failures?
3. **Review bridge layer**: `npx tsx lib/features/tracing/inspector.ts layer bridge <runId>` — was the request received? DB lookup ok? Model mapping ok? Any malformed NDJSON lines?
4. **Review worker layer**: `npx tsx lib/features/tracing/inspector.ts layer worker <runId>` — did the session create? Did Pi SDK emit events? Were there prompt errors?
5. **Review client layer**: `npx tsx lib/features/tracing/inspector.ts layer client <runId>` — did the action call succeed? Did the run finalize?

### Common Coding Agent Failures

| Symptom | Trace Check |
|---------|-------------|
| "Session not found" | `bridge` → `db.lookup` with `found: false` |
| Worker unreachable | `bridge` → `rpc.http_error` events |
| Malformed Pi event | `bridge` → `stream.malformed` events (warn level) |
| Pi SDK crash | `worker` → `session.prompt_error` events |
| Model mapping error | `bridge` → `rpc.error` with `Unsupported coding agent model` |
| Run timeout | `bridge` → `stream.error` or `worker` → long duration without `session.prompt_complete` |
| Stub fallback active | `bridge` → `rpc.call` with URL pointing to `/worker-stub` |

### Trace Correlation

The API route includes `X-Trace-Run-Id` in the response headers. The client hook's `runId` is generated browser-side. The bridge API route also generates its own `runId` for the stream. For full correlation, check which `runId` appears in most events.

Traces are stored in `traces/{runId}.ndjson`. Enable with `TRACE_ENABLED=1`.
```

- [ ] **Step 2: Commit**

```bash
git add .agents/skills/trace-analyzer/SKILL.md
git commit -m "feat(skills): extend trace-analyzer with coding agent trace analysis"
```

---

### Task 15: Verification

**Files:** All previously created/modified files

- [ ] **Step 1: Run linting**

```bash
pnpm lint:fix
```
Expected: No lint errors.

- [ ] **Step 2: Run TypeScript type check**

```bash
npx tsc --noEmit
```
Expected: No type errors.

- [ ] **Step 3: Run unit tests**

```bash
pnpm test:unit
```
Expected: All tests pass.

- [ ] **Step 4: Commit final fixes (if any)**

```bash
git add -A
git commit -m "chore(tracing): lint fixes and final verification"
```
