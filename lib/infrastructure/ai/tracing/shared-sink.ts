import "server-only";
import { getOrCreateFileSink } from "./file-trace-sink";
import { isTracingEnabled, noopTraceSink, type TraceSink } from "./trace-sink";

const _sinkCache = new Map<string, TraceSink>();

export const getSharedTraceSink = (runId: string): TraceSink => {
  if (!isTracingEnabled()) return noopTraceSink;
  if (_sinkCache.has(runId)) return _sinkCache.get(runId)!;
  const sink = getOrCreateFileSink(runId);
  _sinkCache.set(runId, sink);
  return sink;
};

export const closeAllTraceSinks = async (): Promise<void> => {
  for (const sink of _sinkCache.values()) {
    if (
      sink instanceof Object &&
      "close" in sink &&
      typeof (sink as { close?: unknown }).close === "function"
    ) {
      await (sink as { close: () => Promise<void> }).close();
    }
  }
  _sinkCache.clear();
};
