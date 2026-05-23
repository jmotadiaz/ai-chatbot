import { estimateTokens } from "./token-estimation";
import type { CutPointResult } from "./types";
import type { ChatbotMessage } from "@/lib/features/chat/types";

export function findCutPoint(
  messages: ChatbotMessage[],
  keepRecentTokens: number,
): CutPointResult {
  let accumulatedTokens = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(messages[i]);

    if (accumulatedTokens + msgTokens > keepRecentTokens) {
      const cutIndex = i;

      return {
        cutIndex,
        tokensToSummarize: messages
          .slice(0, cutIndex + 1)
          .reduce((sum, m) => sum + estimateTokens(m), 0),
        messagesToSummarize: messages.slice(0, cutIndex + 1),
        messagesToKeep: messages.slice(cutIndex + 1),
      };
    }

    accumulatedTokens += msgTokens;
  }

  return {
    cutIndex: -1,
    tokensToSummarize: 0,
    messagesToSummarize: [],
    messagesToKeep: messages,
  };
}
