import { fileURLToPath } from "node:url";
import { appendFile, mkdir, writeFile, readdir, rm, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import type { FinishPayload, TraceEvent, TraceRecord, TraceSink } from "./types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TRACE_DIR = resolve(__dirname, "../traces");
const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_BUFFER_SIZE = 20;

export interface FileTraceSinkOptions {
  traceDir?: string;
  runId: string;
  /** If true, directory is cleared on open. Default true. Set false for worker processes appending to existing run. */
  truncate?: boolean;
  /** Trace partition under TRACE_DIR. Defaults to coding-agent. */
  partition?: "coding-agent" | "chatbot" | (string & {});
  /** Flush policy override. Defaults to (5s OR 20 events). */
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

interface TraceStats {
  runId: string;
  sessionId?: string;
  chatId?: string;
  userId?: string;
  agent?: string;
  startTime?: string;
  endTime?: string;
  durationMs?: number;
  status: "ok" | "error";
  counts: {
    total: number;
    byLayer?: Record<string, number>;
    byLevel?: Record<string, number>;
    byEvent?: Record<string, number>;
    byPhase?: Record<string, number>;
  };
  tokens?: {
    input: number;
    output: number;
  };
}

type TraceEntry = TraceRecord | TraceEvent;

const isModelTraceEvent = (entry: TraceEntry): entry is TraceEvent =>
  "phase" in entry && "ts" in entry;

const ensureRecordCount = (
  counts: TraceStats["counts"],
  key: "byLayer" | "byLevel" | "byEvent" | "byPhase",
): Record<string, number> => {
  counts[key] ??= {};
  return counts[key];
};

export class FileTraceSink implements TraceSink {
  private readonly traceDir: string;
  private readonly runId: string;
  private readonly truncate: boolean;
  private readonly flushIntervalMs: number;
  private readonly flushBufferSize: number;
  private buffer: TraceEntry[] = [];
  private opening: Promise<void> | null = null;
  private flushing: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private opened = false;
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
    const partition = opts.partition ?? "coding-agent";
    this.traceDir = baseTraceDir.endsWith(partition)
      ? baseTraceDir
      : resolve(baseTraceDir, partition);

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
    if (this.opened) return;
    if (this.opening) {
      await this.opening;
      return;
    }
    this.opening = this.openInternal().finally(() => {
      this.opening = null;
    });
    await this.opening;
  }

  private async openInternal(): Promise<void> {
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
    this.opened = true;
  }

  write(event: TraceEntry): void {
    if (this.closed) return;
    this.buffer.push(event);
    if (this.buffer.length >= this.flushBufferSize) {
      void this.flush();
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.flush();
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
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

  private async writeBuffer(records: TraceEntry[]): Promise<void> {
    if (records.length === 0) return;
    await this.open();

    const lifecycleRecords: TraceEntry[] = [];
    const streamRecords: TraceEntry[] = [];
    const errorRecords: TraceEntry[] = [];

    for (const record of records) {
      if (isModelTraceEvent(record)) {
        if (record.phase === "error" || record.phase === "abort") {
          errorRecords.push(record);
          lifecycleRecords.push(record);
        } else if (
          record.phase === "text-delta" ||
          record.phase === "reasoning-delta" ||
          record.phase === "tool-input-delta"
        ) {
          streamRecords.push(record);
        } else {
          lifecycleRecords.push(record);
        }
      } else if (record.level === "warn" || record.level === "error") {
        errorRecords.push(record);
        lifecycleRecords.push(record);
      } else if (record.level === "debug") {
        streamRecords.push(record);
      } else {
        lifecycleRecords.push(record);
      }
    }

    const promises: Promise<void>[] = [];

    if (lifecycleRecords.length > 0) {
      const line = lifecycleRecords.map((e) => JSON.stringify(e)).join("\n") + "\n";
      promises.push(appendFile(this.lifecyclePath, line, "utf8"));
    }

    if (streamRecords.length > 0) {
      const line = streamRecords.map((e) => JSON.stringify(e)).join("\n") + "\n";
      promises.push(appendFile(this.streamPath, line, "utf8"));
    }

    if (errorRecords.length > 0) {
      const line = errorRecords.map((e) => JSON.stringify(e)).join("\n") + "\n";
      promises.push(appendFile(this.errorsPath, line, "utf8"));
    }

    if (this.rawPath && records.length > 0) {
      const line = records.map((e) => JSON.stringify(e)).join("\n") + "\n";
      promises.push(appendFile(this.rawPath, line, "utf8"));
    }

    // Also update summary
    promises.push(this.updateSummary(records));

    try {
      await Promise.all(promises);
    } catch (err) {
      console.error("[trace] sink write failed:", err);
    }
  }

  private async updateSummary(newEvents: TraceEntry[]): Promise<void> {
    let summary: TraceStats = {
      runId: this.runId,
      status: "ok",
      counts: {
        total: 0,
        byLayer: {},
        byLevel: {},
        byEvent: {},
        byPhase: {},
      },
      tokens: {
        input: 0,
        output: 0,
      },
    };

    if (existsSync(this.summaryPath)) {
      try {
        summary = JSON.parse(await readFile(this.summaryPath, "utf8")) as TraceStats;
        summary.counts.total ??= 0;
        summary.tokens ??= { input: 0, output: 0 };
      } catch {
        // Ignored
      }
    }

    for (const e of newEvents) {
      const timestamp = isModelTraceEvent(e) ? e.ts : e.timestamp;

      if (!summary.startTime || new Date(timestamp) < new Date(summary.startTime)) {
        summary.startTime = timestamp;
      }
      if (!summary.endTime || new Date(timestamp) > new Date(summary.endTime)) {
        summary.endTime = timestamp;
      }

      summary.counts.total++;

      if (isModelTraceEvent(e)) {
        if (e.chatId && !summary.chatId) summary.chatId = e.chatId;
        if (e.userId && !summary.userId) summary.userId = e.userId;
        if (e.agent && !summary.agent) summary.agent = e.agent;
        if (e.phase === "error") summary.status = "error";

        const byPhase = ensureRecordCount(summary.counts, "byPhase");
        byPhase[e.phase] = (byPhase[e.phase] ?? 0) + 1;

        if (e.phase === "finish") {
          const payload = e.payload as { usage?: FinishPayload["usage"] };
          if (payload.usage?.inputTokens) {
            summary.tokens!.input += payload.usage.inputTokens;
          }
          if (payload.usage?.outputTokens) {
            summary.tokens!.output += payload.usage.outputTokens;
          }
        }
      } else {
        if (e.sessionId && !summary.sessionId) summary.sessionId = e.sessionId;
        if (e.level === "error") summary.status = "error";

        const byLayer = ensureRecordCount(summary.counts, "byLayer");
        const byLevel = ensureRecordCount(summary.counts, "byLevel");
        const byEvent = ensureRecordCount(summary.counts, "byEvent");
        byLayer[e.layer] = (byLayer[e.layer] ?? 0) + 1;
        byLevel[e.level] = (byLevel[e.level] ?? 0) + 1;
        byEvent[e.eventName] = (byEvent[e.eventName] ?? 0) + 1;
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
