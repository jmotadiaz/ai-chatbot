import { useMemo } from "react";
import type { ChatbotMessage } from "@/lib/features/chat/types";

interface ChatMessagesTurns {
  previousMessages: ChatbotMessage[];
  lastTurnMessages: ChatbotMessage[];
}

/**
 * Splits messages into previous turns and the last turn (starting from the last user message).
 * This enables layout where only the last turn has min-height for proper scroll positioning.
 */
export const useChatMessagesTurns = (
  messages: ChatbotMessage[]
): ChatMessagesTurns => {
  return useMemo(() => {
    if (messages.length === 0) {
      return { previousMessages: [], lastTurnMessages: [] };
    }
    // Find the index of the last user message
    const lastUserIndex = messages.findLastIndex((m) => m.role === "user");
    if (lastUserIndex === -1) {
      return { previousMessages: [], lastTurnMessages: messages };
    }
    return {
      previousMessages: messages.slice(0, lastUserIndex),
      lastTurnMessages: messages.slice(lastUserIndex),
    };
  }, [messages]);
};

