import type { ChatbotMessage } from "@/lib/features/chat/types";

const RAW_DEFAULT_KEEP_RECENT_TOKENS = 20_000;
const RAW_DEFAULT_RESERVE_TOKENS = 16_384;
export const DEFAULT_KEEP_RECENT_TOKENS = RAW_DEFAULT_KEEP_RECENT_TOKENS;
export const DEFAULT_RESERVE_TOKENS = RAW_DEFAULT_RESERVE_TOKENS;
export const DEFAULT_CONTEXT_WINDOW = parseInt(
  process.env.COMPACTION_CONTEXT_WINDOW ?? "128000",
  10,
);

export function getEffectiveKeepRecentTokens(contextWindow: number): number {
  return Math.min(
    RAW_DEFAULT_KEEP_RECENT_TOKENS,
    Math.floor(contextWindow * 0.1),
  );
}

export function getEffectiveReserveTokens(contextWindow: number): number {
  return Math.min(
    RAW_DEFAULT_RESERVE_TOKENS,
    Math.floor(contextWindow * 0.1),
  );
}

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
