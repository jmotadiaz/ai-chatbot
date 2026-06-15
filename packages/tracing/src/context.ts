import { AsyncLocalStorage } from "node:async_hooks";
import type { FileTraceSink } from "./sink";

export interface TraceContext {
  runId: string;
  sessionId?: string;
  sink: FileTraceSink | null;
}

const storage = new AsyncLocalStorage<TraceContext>();

export function runWithTraceContext<T>(
  ctx: TraceContext,
  fn: () => Promise<T> | T,
): Promise<T> | T {
  return storage.run(ctx, fn);
}

export function getTraceContext(): TraceContext | undefined {
  return storage.getStore();
}
