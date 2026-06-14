import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";

// --- Embedded tracing for the worker process ---
// Duplicated from lib/features/tracing/ because the worker has its own
// package.json ("type": "module") creating a package boundary that prevents
// importing from ../features/tracing

export type LogLevel = "debug" | "info" | "warn" | "error";
export type TraceLayer = "worker" | "bridge" | "client";

export interface TraceRecord {
  timestamp: string;
  runId: string;
  layer: TraceLayer;
  sessionId?: string;
  level: LogLevel;
  eventName: string;
  durationMs?: number;
  payload: unknown;
}

const DEFAULT_TRACE_DIR = "traces";
const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_BUFFER_SIZE = 20;

export interface FileTraceSinkOptions {
  traceDir?: string;
  runId: string;
  truncate?: boolean;
}

export class FileTraceSink {
  private readonly filePath: string;
  private readonly truncate: boolean;
  private buffer: TraceRecord[] = [];
  private flushing: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(opts: FileTraceSinkOptions) {
    const traceDir = opts.traceDir ?? process.env.TRACE_DIR ?? DEFAULT_TRACE_DIR;
    this.filePath = resolve(traceDir, `${opts.runId}.ndjson`);
    this.truncate = opts.truncate ?? true;
  }

  async open(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    if (this.truncate) {
      await writeFile(this.filePath, "", { flag: "w" });
    }
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    if (this.timer.unref) this.timer.unref();
  }

  write(event: TraceRecord): void {
    if (this.closed) return;
    this.buffer.push(event);
    if (this.buffer.length >= FLUSH_BUFFER_SIZE) void this.flush();
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
    if (this.flushing) { await this.flushing; return; }
    if (this.buffer.length === 0) return;
    const toWrite = this.buffer;
    this.buffer = [];
    this.flushing = this.writeBuffer(toWrite).finally(() => { this.flushing = null; });
    await this.flushing;
  }

  private async writeBuffer(records: TraceRecord[]): Promise<void> {
    if (records.length === 0) return;
    const line = records.map((e) => JSON.stringify(e)).join("\n") + "\n";
    try { await appendFile(this.filePath, line, "utf8"); } catch (err) {
      console.error("[trace] sink write failed:", err);
    }
  }
}

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

export function isTracingEnabled(): boolean {
  return process.env.TRACE_ENABLED === "1";
}

export class TraceLogger {
  private layer: TraceLayer;
  private sink: FileTraceSink | null;

  constructor(layer: TraceLayer, sink: FileTraceSink | null) {
    this.layer = layer;
    this.sink = sink;
  }

  private write(level: LogLevel, eventName: string, payload?: unknown, durationMs?: number): void {
    if (!isTracingEnabled() || !this.sink) return;
    const ctx = getTraceContext();
    this.sink.write({
      timestamp: new Date().toISOString(),
      runId: ctx?.runId ?? "unknown",
      layer: this.layer,
      sessionId: ctx?.sessionId,
      level,
      eventName,
      durationMs,
      payload,
    });
  }

  debug(eventName: string, payload?: unknown): void { this.write("debug", eventName, payload); }
  info(eventName: string, payload?: unknown): void { this.write("info", eventName, payload); }
  warn(eventName: string, payload?: unknown): void { this.write("warn", eventName, payload); }
  error(eventName: string, payload?: unknown): void { this.write("error", eventName, payload); }

  startTimer(eventName: string, payload?: unknown): () => void {
    const start = Date.now();
    return () => { this.write("info", `${eventName}_end`, payload, Date.now() - start); };
  }
}

export function getTraceLogger(layer: TraceLayer): TraceLogger {
  const ctx = getTraceContext();
  return new TraceLogger(layer, ctx?.sink ?? null);
}
