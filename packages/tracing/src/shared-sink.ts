import { FileTraceSink } from "./sink";
import { isTracingEnabled, noopTraceSink, type TraceSink } from "./types";

const sinkCache = new Map<string, TraceSink>();

export const getSharedTraceSink = (runId: string): TraceSink => {
  if (!isTracingEnabled()) return noopTraceSink;
  if (sinkCache.has(runId)) return sinkCache.get(runId)!;
  const sink = new FileTraceSink({ runId, partition: "chatbot" });
  sinkCache.set(runId, sink);
  return sink;
};

export const closeAllTraceSinks = async (): Promise<void> => {
  for (const sink of sinkCache.values()) {
    await sink.close();
  }
  sinkCache.clear();
};
