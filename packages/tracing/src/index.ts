import { getTraceContext } from "./context";
import { TraceLogger } from "./logger";
import type { TraceLayer } from "./types";

export type { TraceRecord, LogLevel, TraceLayer } from "./types";
export { FileTraceSink, type FileTraceSinkOptions } from "./sink";
export { TraceLogger } from "./logger";
export {
  runWithTraceContext,
  getTraceContext,
  setTraceSessionId,
  type TraceContext,
} from "./context";

export { isTracingEnabled } from "./types";

/** Get a TraceLogger scoped to the current AsyncLocalStorage context. */
export function getTraceLogger(layer: TraceLayer): TraceLogger {
  const ctx = getTraceContext();
  return new TraceLogger(layer, ctx?.sink ?? null);
}
