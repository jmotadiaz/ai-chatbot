import { getTraceContext } from "./context";
import { TraceLogger } from "./logger";
import type { TraceLayer } from "./types";

export type { TraceRecord, LogLevel, TraceLayer } from "./types";
export { FileTraceSink, type FileTraceSinkOptions } from "./sink";
export { TraceLogger } from "./logger";
export { runWithTraceContext, getTraceContext, type TraceContext } from "./context";

export function isTracingEnabled(): boolean {
  return process.env.TRACE_ENABLED === "1";
}

/** Get a TraceLogger scoped to the current AsyncLocalStorage context. */
export function getTraceLogger(layer: TraceLayer): TraceLogger {
  const ctx = getTraceContext();
  return new TraceLogger(layer, ctx?.sink ?? null);
}
