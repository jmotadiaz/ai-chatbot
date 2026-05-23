import type { ChatbotMessage } from "@/lib/features/chat/types";

export const DEFAULT_KEEP_RECENT_TOKENS = 20_000;
export const DEFAULT_RESERVE_TOKENS = 16_384;
export const DEFAULT_CONTEXT_WINDOW = 128_000;

export interface CompactionSettings {
  keepRecentTokens: number;
  reserveTokens: number;
  contextWindow?: number;
  enabled: boolean;
}

export interface CompactionSummary {
  id: string;
  chatId: string;
  messageId: string;
  summary: string;
  tokensBefore: number;
  modelUsed: string;
  createdAt: Date;
}

export interface CutPointResult {
  cutIndex: number;
  tokensToSummarize: number;
  messagesToSummarize: ChatbotMessage[];
  messagesToKeep: ChatbotMessage[];
}
