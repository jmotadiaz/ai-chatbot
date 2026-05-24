import type { CompactionDbPort } from "./ports";
import type { ChatbotMessage } from "@/lib/features/chat/types";

export async function rebuildContext(
  db: CompactionDbPort,
  chatId: string,
  messages: ChatbotMessage[],
  systemPrompt?: string,
): Promise<{
  filteredMessages: ChatbotMessage[];
  augmentedSystemPrompt: string;
}> {
  let filteredMessages = messages;
  let augmentedSystemPrompt = systemPrompt ?? "";

  try {
    const summary = await db.getLatestSummary(chatId);
    if (summary) {
      const summaryMessage = await db.getMessageById(summary.messageId);

      if (summaryMessage?.serial) {
        const allDbMessages = await db.getMessagesByChatId(chatId);

        const summarySerial = summaryMessage.serial;
        const serialMap = new Map(
          allDbMessages.map((m) => [m.id, m.serial]),
        );

        filteredMessages = messages.filter((msg) => {
          const serial = serialMap.get(msg.id);
          return serial ? serial > summarySerial : true;
        });

        augmentedSystemPrompt = `## Previous Context\n${summary.summary}\n\n${systemPrompt ?? ""}`;
      }
    }
  } catch (err) {
    console.error("Context rebuild failed:", err);
  }

  return { filteredMessages, augmentedSystemPrompt };
}
