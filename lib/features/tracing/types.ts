export type LogLevel = "debug" | "info" | "warn" | "error";

export type TraceLayer = "worker" | "bridge" | "client";

export interface TraceRecord {
  timestamp: string;
  runId: string;
  layer: TraceLayer;
  sessionId?: string;
  level: LogLevel;
  eventName: string;
  durationMs?: number;
  payload: unknown;
}
