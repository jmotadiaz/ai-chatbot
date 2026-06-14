import "server-only";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { TraceRecord } from "./types";

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
  private buffer: TraceRecord[] = [];
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
    const line =
      records.map((e) => JSON.stringify(e)).join("\n") + "\n";
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
