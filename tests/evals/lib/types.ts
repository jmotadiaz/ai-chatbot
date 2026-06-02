export interface TranscriptMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: string
  parts?: unknown[]
  toolCalls?: ToolCallRecord[]
  reasoning?: string
  sources?: SourceRecord[]
}

export interface ToolCallRecord {
  toolName: string
  input: unknown
  output?: string
  toolCallId: string
}

export interface SourceRecord {
  url: string
  title?: string
}

export interface CompactionSnapshot {
  triggeredAt: string
  messagesBefore: number
  tokensBefore: number
  summary: string
  modelUsed: string
  summarizedMessageId: string
}

export interface EvalResult {
  compacted: boolean
  compressionRatio: number
  tokensBefore: number
  tokensAfter: number
  answers: FactAnswer[]
}

export interface FactAnswer {
  fact: string
  question: string
  answer: string
}
