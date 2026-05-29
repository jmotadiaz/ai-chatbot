export interface SimulationConfig {
  scenario: string;
  simulatorModel: string;
  chatbotModel: string;
  maxMessages: number;
  maxTokens: number;
  baseUrl: string;
}

export interface TranscriptMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  parts?: unknown[];
  toolCalls?: ToolCallRecord[];
  reasoning?: string;
  sources?: SourceRecord[];
}

export interface ToolCallRecord {
  toolName: string;
  input: unknown;
  output?: string;
  toolCallId: string;
}

export interface SourceRecord {
  url: string;
  title?: string;
}

export interface CompactionSnapshot {
  triggeredAt: string;
  messagesBefore: number;
  tokensBefore: number;
  summary: string;
  modelUsed: string;
  summarizedMessageId: string;
}

export interface SimulationMetrics {
  totalMessages: number;
  totalUserTokens: number;
  totalAssistantTokens: number;
  compactionEvents: number;
  responses: ResponseMetric[];
  tokenCompressionRatios: number[];
}

export interface ResponseMetric {
  messageIndex: number;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface Transcript {
  simulationId: string;
  scenario: string;
  startedAt: string;
  endedAt?: string;
  config: SimulationConfig;
  messages: TranscriptMessage[];
  compactionSnapshots: CompactionSnapshot[];
  metrics: SimulationMetrics;
}
