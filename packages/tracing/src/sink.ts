import { fileURLToPath } from "node:url";
import { appendFile, mkdir, writeFile, readdir, rm, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import type { TraceRecord } from "./types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TRACE_DIR = resolve(__dirname, "../traces");
const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_BUFFER_SIZE = 20;

export interface FileTraceSinkOptions {
  traceDir?: string;
  runId: string;
  /** If true, directory is cleared on open. Default true. Set false for worker processes appending to existing run. */
  truncate?: boolean;
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

interface CodingAgentStats {
  runId: string;
  sessionId?: string;
  startTime?: string;
  endTime?: string;
  durationMs?: number;
  status: "ok" | "error";
  counts: {
    total: number;
    byLayer: Record<string, number>;
    byLevel: Record<string, number>;
    byEvent: Record<string, number>;
  };
}

export class FileTraceSink {
  private readonly traceDir: string;
  private readonly runId: string;
  private readonly truncate: boolean;
  private readonly flushIntervalMs: number;
  private readonly flushBufferSize: number;
  private buffer: TraceRecord[] = [];
  private flushing: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
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
    // Ensure we separate by package: append "coding-agent" if not already present
    this.traceDir = baseTraceDir.endsWith("coding-agent")
      ? baseTraceDir
      : resolve(baseTraceDir, "coding-agent");

    this.runId = opts.runId;
    this.truncate = opts.truncate ?? true;
    this.flushIntervalMs = FLUSH_INTERVAL_MS;
    this.flushBufferSize = FLUSH_BUFFER_SIZE;
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

  write(event: TraceRecord): void {
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

  private async writeBuffer(records: TraceRecord[]): Promise<void> {
    if (records.length === 0) return;

    // Classify and write records
    const lifecycleRecords: TraceRecord[] = [];
    const streamRecords: TraceRecord[] = [];
    const errorRecords: TraceRecord[] = [];

    for (const record of records) {
      if (record.level === "warn" || record.level === "error") {
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

  private async updateSummary(newEvents: TraceRecord[]): Promise<void> {
    let summary: CodingAgentStats = {
      runId: this.runId,
      status: "ok",
      counts: {
        total: 0,
        byLayer: {},
        byLevel: {},
        byEvent: {},
      }
    };

    if (existsSync(this.summaryPath)) {
      try {
        summary = JSON.parse(await readFile(this.summaryPath, "utf8")) as CodingAgentStats;
      } catch {
        // Ignored
      }
    }

    for (const e of newEvents) {
      if (e.sessionId && !summary.sessionId) summary.sessionId = e.sessionId;
      
      if (!summary.startTime || new Date(e.timestamp) < new Date(summary.startTime)) {
        summary.startTime = e.timestamp;
      }
      if (!summary.endTime || new Date(e.timestamp) > new Date(summary.endTime)) {
        summary.endTime = e.timestamp;
      }
      
      if (e.level === "error") {
        summary.status = "error";
      }
      
      summary.counts.total++;
      summary.counts.byLayer[e.layer] = (summary.counts.byLayer[e.layer] ?? 0) + 1;
      summary.counts.byLevel[e.level] = (summary.counts.byLevel[e.level] ?? 0) + 1;
      summary.counts.byEvent[e.eventName] = (summary.counts.byEvent[e.eventName] ?? 0) + 1;
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
