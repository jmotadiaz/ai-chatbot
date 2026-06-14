import "server-only";
import { getTraceContext } from "./context";
import type { FileTraceSink } from "./sink";
import type { TraceLayer, LogLevel } from "./types";
import { isTracingEnabled } from "./types";

export class TraceLogger {
  private layer: TraceLayer;
  private sink: FileTraceSink | null;

  constructor(layer: TraceLayer, sink: FileTraceSink | null) {
    this.layer = layer;
    this.sink = sink;
  }

  private write(
    level: LogLevel,
    eventName: string,
    payload?: unknown,
    durationMs?: number,
  ): void {
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

  debug(eventName: string, payload?: unknown): void {
    this.write("debug", eventName, payload);
  }

  info(eventName: string, payload?: unknown): void {
    this.write("info", eventName, payload);
  }

  warn(eventName: string, payload?: unknown): void {
    this.write("warn", eventName, payload);
  }

  error(eventName: string, payload?: unknown): void {
    this.write("error", eventName, payload);
  }

  /** Returns a stop function that logs `{eventName}_end` with durationMs. */
  startTimer(eventName: string, payload?: unknown): () => void {
    const start = Date.now();
    return () => {
      this.write("info", `${eventName}_end`, payload, Date.now() - start);
    };
  }
}
