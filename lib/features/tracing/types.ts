export type LogLevel = "debug" | "info" | "warn" | "error";

export type TraceLayer = "worker" | "bridge" | "client";

export interface TraceEvent {
  ts: string;
  runId: string;
  layer: TraceLayer;
  sessionId?: string;
  level: LogLevel;
  event: string;
  durationMs?: number;
  payload: unknown;
}
