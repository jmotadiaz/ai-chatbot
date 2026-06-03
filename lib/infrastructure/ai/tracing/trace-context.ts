import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

export interface TraceContext {
  runId: string;
  requestId: string;
  stepIndex: number;
  chatId?: string;
  userId?: string;
  agent?: string;
  modelKey?: string;
}

const storage = new AsyncLocalStorage<TraceContext>();

export const runWithTraceContext = <T>(
  ctx: TraceContext,
  fn: () => Promise<T> | T,
): Promise<T> | T => storage.run(ctx, fn);

export const getTraceContext = (): TraceContext | undefined =>
  storage.getStore();

export const updateTraceContext = (patch: Partial<TraceContext>): void => {
  const current = storage.getStore();
  if (!current) return;
  Object.assign(current, patch);
};

export const bumpStepIndex = (): number => {
  const current = storage.getStore();
  if (!current) return 0;
  current.stepIndex += 1;
  return current.stepIndex;
};

export const newRequestId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};
