import "server-only";
import { appendFile, mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { TraceEvent, TraceSink } from "./trace-sink";

const DEFAULT_TRACE_DIR = "tests/evals/traces";
const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_BUFFER_SIZE = 20;

export interface FileTraceSinkOptions {
  traceDir?: string;
  runId: string;
  /**
   * If true, the file is truncated on open. Default true.
   * Set false when multiple sinks share the same file (rare).
   */
  truncate?: boolean;
  /**
   * Flush policy override. Defaults to (5s OR 20 events).
   */
  flushIntervalMs?: number;
  flushBufferSize?: number;
}

export class FileTraceSink implements TraceSink {
  private readonly filePath: string;
  private readonly truncate: boolean;
  private readonly flushIntervalMs: number;
  private readonly flushBufferSize: number;
  private buffer: TraceEvent[] = [];
  private flushing: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(opts: FileTraceSinkOptions) {
    const traceDir =
      opts.traceDir ?? process.env.TRACE_DIR ?? DEFAULT_TRACE_DIR;
    this.filePath = resolve(traceDir, `${opts.runId}.ndjson`);
    this.truncate = opts.truncate ?? true;
    this.flushIntervalMs = opts.flushIntervalMs ?? FLUSH_INTERVAL_MS;
    this.flushBufferSize = opts.flushBufferSize ?? FLUSH_BUFFER_SIZE;
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
      console.error("[trace-sink] write failed:", err);
    }
  }

  getFilePath(): string {
    return this.filePath;
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
