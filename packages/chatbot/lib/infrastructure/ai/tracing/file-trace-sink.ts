import "server-only";
import { existsSync } from "node:fs";
import { appendFile, mkdir, rename, writeFile, readdir, rm, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { TraceEvent, TraceSink } from "./trace-sink";

const DEFAULT_TRACE_DIR = "tests/evals/traces";
const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_BUFFER_SIZE = 20;

export interface FileTraceSinkOptions {
  traceDir?: string;
  runId: string;
  /**
   * If true, the directory is cleared on open. Default true.
   * Set false when multiple sinks share the same run (rare).
   */
  truncate?: boolean;
  /**
   * Flush policy override. Defaults to (5s OR 20 events).
   */
  flushIntervalMs?: number;
  flushBufferSize?: number;
}

function getFormattedDateTime(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

interface ChatbotStats {
  runId: string;
  chatId?: string;
  userId?: string;
  agent?: string;
  startTime?: string;
  endTime?: string;
  durationMs?: number;
  status: "ok" | "error";
  counts: {
    total: number;
    byPhase: Record<string, number>;
  };
  tokens: {
    input: number;
    output: number;
  };
}

export class FileTraceSink implements TraceSink {
  private readonly traceDir: string;
  private readonly runId: string;
  private readonly truncate: boolean;
  private readonly flushIntervalMs: number;
  private readonly flushBufferSize: number;
  private buffer: TraceEvent[] = [];
  private flushing: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private closed = false;

  private targetDirResolved = "";
  private lifecyclePath = "";
  private streamPath = "";
  private errorsPath = "";
  private rawPath = "";
  private summaryPath = "";

  constructor(opts: FileTraceSinkOptions) {
    const baseTraceDir =
      opts.traceDir ?? process.env.TRACE_DIR ?? DEFAULT_TRACE_DIR;
    // Ensure we separate by package: append "chatbot" if not already present
    this.traceDir = baseTraceDir.endsWith("chatbot")
      ? baseTraceDir
      : resolve(baseTraceDir, "chatbot");

    this.runId = opts.runId;
    this.truncate = opts.truncate ?? true;
    this.flushIntervalMs = opts.flushIntervalMs ?? FLUSH_INTERVAL_MS;
    this.flushBufferSize = opts.flushBufferSize ?? FLUSH_BUFFER_SIZE;
  }

  private async resolveTargetDir(): Promise<string> {
    const runIdShort = this.runId.length > 8 ? this.runId.slice(0, 8) : this.runId;
    try {
      const entries = await readdir(this.traceDir);
      const match = entries.find((name) => name.endsWith(`_${runIdShort}`));
      if (match) {
        return resolve(this.traceDir, match);
      }
    } catch {
      // Directory might not exist yet
    }
    const timestamp = getFormattedDateTime();
    return resolve(this.traceDir, `${timestamp}_${runIdShort}`);
  }

  async open(): Promise<void> {
    const targetDir = await this.resolveTargetDir();
    this.targetDirResolved = targetDir;

    if (this.truncate) {
      try {
        await rm(targetDir, { recursive: true, force: true });
      } catch {
        // Ignored
      }
    }

    await mkdir(targetDir, { recursive: true });

    this.lifecyclePath = resolve(targetDir, "lifecycle.ndjson");
    this.streamPath = resolve(targetDir, "stream.ndjson");
    this.errorsPath = resolve(targetDir, "errors.ndjson");
    this.summaryPath = resolve(targetDir, "summary.json");
    if (process.env.TRACE_RAW === "1") {
      this.rawPath = resolve(targetDir, "raw.ndjson");
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

    const lifecycleEvents: TraceEvent[] = [];
    const streamEvents: TraceEvent[] = [];
    const errorEvents: TraceEvent[] = [];

    for (const event of events) {
      if (event.phase === "error" || event.phase === "abort") {
        errorEvents.push(event);
        lifecycleEvents.push(event);
      } else if (
        event.phase === "text-delta" ||
        event.phase === "reasoning-delta" ||
        event.phase === "tool-input-delta"
      ) {
        streamEvents.push(event);
      } else {
        lifecycleEvents.push(event);
      }
    }

    const promises: Promise<void>[] = [];

    if (lifecycleEvents.length > 0) {
      const line = lifecycleEvents.map((e) => JSON.stringify(e)).join("\n") + "\n";
      promises.push(appendFile(this.lifecyclePath, line, "utf8"));
    }

    if (streamEvents.length > 0) {
      const line = streamEvents.map((e) => JSON.stringify(e)).join("\n") + "\n";
      promises.push(appendFile(this.streamPath, line, "utf8"));
    }

    if (errorEvents.length > 0) {
      const line = errorEvents.map((e) => JSON.stringify(e)).join("\n") + "\n";
      promises.push(appendFile(this.errorsPath, line, "utf8"));
    }

    if (this.rawPath && events.length > 0) {
      const line = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
      promises.push(appendFile(this.rawPath, line, "utf8"));
    }

    promises.push(this.updateSummary(events));

    try {
      await Promise.all(promises);
    } catch (err) {
      console.error("[trace-sink] write failed:", err);
    }
  }

  private async updateSummary(newEvents: TraceEvent[]): Promise<void> {
    let summary: ChatbotStats = {
      runId: this.runId,
      status: "ok",
      counts: {
        total: 0,
        byPhase: {},
      },
      tokens: {
        input: 0,
        output: 0,
      }
    };

    if (existsSync(this.summaryPath)) {
      try {
        summary = JSON.parse(await readFile(this.summaryPath, "utf8")) as ChatbotStats;
      } catch {
        // Ignored
      }
    }

    for (const e of newEvents) {
      if (e.chatId && !summary.chatId) summary.chatId = e.chatId;
      if (e.userId && !summary.userId) summary.userId = e.userId;
      if (e.agent && !summary.agent) summary.agent = e.agent;

      if (!summary.startTime || new Date(e.ts) < new Date(summary.startTime)) {
        summary.startTime = e.ts;
      }
      if (!summary.endTime || new Date(e.ts) > new Date(summary.endTime)) {
        summary.endTime = e.ts;
      }

      if (e.phase === "error") {
        summary.status = "error";
      }

      summary.counts.total++;
      summary.counts.byPhase[e.phase] = (summary.counts.byPhase[e.phase] ?? 0) + 1;

      if (e.phase === "finish") {
        const p = e.payload as {
          usage?: { inputTokens?: number; outputTokens?: number }
        };
        if (p.usage?.inputTokens) summary.tokens.input += p.usage.inputTokens;
        if (p.usage?.outputTokens) summary.tokens.output += p.usage.outputTokens;
      }
    }

    if (summary.startTime && summary.endTime) {
      summary.durationMs = new Date(summary.endTime).getTime() - new Date(summary.startTime).getTime();
    }

    await writeFile(this.summaryPath, JSON.stringify(summary, null, 2), "utf8");
  }

  getFilePath(): string {
    return this.lifecyclePath || resolve(this.targetDirResolved, "lifecycle.ndjson");
  }
}

let _sharedSink: FileTraceSink | null = null;
let _sharedRunId: string | null = null;

export const getOrCreateFileSink = (
  runId: string,
  traceDir?: string,
): FileTraceSink => {
  if (_sharedSink && _sharedRunId === runId) return _sharedSink;
  _sharedSink = new FileTraceSink({ runId, traceDir });
  _sharedRunId = runId;
  return _sharedSink;
};

export const resetSharedSinkForTests = (): void => {
  _sharedSink = null;
  _sharedRunId = null;
};

export { rename as _renameForTests };
