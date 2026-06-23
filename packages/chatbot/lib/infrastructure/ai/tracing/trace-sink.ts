export type TracePhase =
  | "start"
  | "text-delta"
  | "reasoning-delta"
  | "tool-input-start"
  | "tool-input-delta"
  | "tool-input-end"
  | "tool-call"
  | "tool-result"
  | "source"
  | "finish"
  | "error"
  | "abort";

export type TraceMode = "generate" | "stream";

export interface ToolCallPayload {
  toolCallId: string;
  toolName: string;
  input?: unknown;
  output?: unknown;
  providerExecuted?: boolean;
}

export interface SourcePayload {
  url: string;
  title?: string;
  sourceType?: "url" | "document";
}

export interface FinishPayload {
  finishReason?: { unified: string; raw?: unknown };
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
    cachedInputTokens?: number;
  };
  providerMetadata?: unknown;
}

export interface PromptPayload {
  prompt: unknown[];
  model: { provider: string; modelId: string };
  settings?: Record<string, unknown>;
}

export interface TraceEvent {
  ts: string;
  runId: string;
  requestId: string;
  stepIndex: number;
  mode: TraceMode;
  modelKey?: string;
  chatId?: string;
  userId?: string;
  agent?: string;
  phase: TracePhase;
  blockId?: string;
  blockKind?: "text" | "reasoning" | "tool-input";
  payload: unknown;
}

export interface TraceSink {
  open(runId: string): Promise<void> | void;
  write(event: TraceEvent): Promise<void> | void;
  close(): Promise<void> | void;
}

export const noopTraceSink: TraceSink = {
  open: () => undefined,
  write: () => undefined,
  close: () => undefined,
};

export const isTracingEnabled = (): boolean =>
  process.env.TRACE_ENABLED === "1";
