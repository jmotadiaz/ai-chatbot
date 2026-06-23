import { AsyncLocalStorage } from "node:async_hooks";
import type { FileTraceSink } from "./sink";

export interface TraceContext {
  runId: string;
  requestId?: string;
  stepIndex?: number;
  sessionId?: string;
  chatId?: string;
  userId?: string;
  agent?: string;
  modelKey?: string;
  sink?: FileTraceSink | null;
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

export function setTraceSessionId(sessionId: string | undefined): void {
  if (!sessionId) return;
  const ctx = storage.getStore();
  if (!ctx || ctx.sessionId) return;
  ctx.sessionId = sessionId;
}

export function updateTraceContext(patch: Partial<TraceContext>): void {
  const ctx = storage.getStore();
  if (!ctx) return;
  Object.assign(ctx, patch);
}

export function bumpStepIndex(): number {
  const ctx = storage.getStore();
  if (!ctx) return 0;
  ctx.stepIndex = (ctx.stepIndex ?? 0) + 1;
  return ctx.stepIndex;
}

export function newRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
