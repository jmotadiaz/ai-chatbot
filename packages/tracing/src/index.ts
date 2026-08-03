import { TraceLogger } from "./logger";
import type { TraceLayer } from "./types";
import { getTraceContext } from "./context";

export type {
  TraceRecord,
  LogLevel,
  TraceLayer,
  TraceEvent,
  TracePhase,
  TraceMode,
  TraceSink,
  ToolCallPayload,
  SourcePayload,
  FinishPayload,
  PromptPayload,
} from "./types";
export { isTracingEnabled, noopTraceSink } from "./types";
export { FileTraceSink, type FileTraceSinkOptions } from "./sink";
export { TraceLogger } from "./logger";
export {
  runWithTraceContext,
  getTraceContext,
  setTraceSessionId,
  updateTraceContext,
  bumpStepIndex,
  newRequestId,
  type TraceContext,
} from "./context";
export { createTracingMiddleware } from "./model-middleware";
export { closeAllTraceSinks, getSharedTraceSink } from "./shared-sink";
export {
  acquireTraceSink,
  releaseTraceSink,
  retainTraceSink,
  traceSinkRefCount,
} from "./sink-registry";
export { wrapWithTracing } from "./wrap-with-tracing";

/** Get a TraceLogger scoped to the current AsyncLocalStorage context. */
export function getTraceLogger(layer: TraceLayer): TraceLogger {
  const ctx = getTraceContext();
  return new TraceLogger(layer, ctx?.sink ?? null);
}
