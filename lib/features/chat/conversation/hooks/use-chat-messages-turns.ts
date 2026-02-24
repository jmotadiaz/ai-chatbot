import { useMemo } from "react";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import { UseChatResult } from "@/lib/features/chat/conversation/hooks/use-chat";

interface ChatMessagesTurns {
  previousMessages: ChatbotMessage[];
  lastTurnMessages: ChatbotMessage[];
}

/**
 * Splits messages into previous turns and the last turn (starting from the last user message).
 * This enables layout where only the last turn has min-height for proper scroll positioning.
 */
export const useChatMessagesTurns = (
  messages: ChatbotMessage[],
  status: UseChatResult["status"],
): ChatMessagesTurns => {
  return useMemo(() => {
    if (messages.length === 0) {
      return { previousMessages: [], lastTurnMessages: [] };
    }

    const lastMessage = messages.at(-1);
    const shouldBeFinished = status === "ready" || status === "error";

    const processedMessages =
      lastMessage?.role === "user"
        ? [
            ...messages,
            {
              id: `empty-assistant-message-${messages.length}`,
              role: "assistant",
              parts: [],
              metadata: {
                status: shouldBeFinished ? "finished" : "started",
              },
            } satisfies ChatbotMessage,
          ]
        : lastMessage?.role === "assistant" && shouldBeFinished
          ? [
              ...messages.slice(0, -1),
              {
                ...lastMessage,
                metadata: {
                  ...lastMessage.metadata,
                  status: "finished",
                },
              } satisfies ChatbotMessage,
            ]
          : messages;
    // Find the index of the last user message
    const lastUserIndex = processedMessages.findLastIndex(
      (m) => m.role === "user",
    );
    if (lastUserIndex === -1) {
      return { previousMessages: [], lastTurnMessages: processedMessages };
    }
    return {
      previousMessages: processedMessages.slice(0, lastUserIndex),
      lastTurnMessages: processedMessages.slice(lastUserIndex),
    };
  }, [messages, status]);
};
