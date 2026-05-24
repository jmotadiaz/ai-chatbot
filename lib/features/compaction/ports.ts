import type {
  ChatSummary,
  InsertChatSummary,
  Message,
} from "@/lib/infrastructure/db/schema";
import type { Transactional } from "@/lib/infrastructure/db/queries";

export interface CompactionDbPort {
  getLatestSummary(chatId: string): Promise<ChatSummary | undefined>;
  saveSummary(data: InsertChatSummary): Transactional<ChatSummary>;
  getMessagesByChatId(chatId: string): Promise<Message[]>;
  getMessageById(id: string): Promise<Message | undefined>;
  transaction<T>(fn: Transactional<T>): Promise<T>;
}

export interface CompactionAiPort {
  generateText(
    modelKey: string,
    system: string,
    prompt: string,
  ): Promise<string>;
}
