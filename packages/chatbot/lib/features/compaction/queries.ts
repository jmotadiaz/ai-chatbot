import "server-only";

import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/infrastructure/db/db";
import {
  chatSummary,
  message,
  type ChatSummary,
  type InsertChatSummary,
  type Message,
} from "@/lib/infrastructure/db/schema";
import type { Transactional } from "@/lib/infrastructure/db/queries";

export async function getLatestSummary(chatId: string): Promise<ChatSummary | undefined> {
  const [record] = await getDb()
    .select()
    .from(chatSummary)
    .where(eq(chatSummary.chatId, chatId))
    .orderBy(desc(chatSummary.createdAt))
    .limit(1);
  return record;
}

export const saveSummary = (data: InsertChatSummary): Transactional<ChatSummary> =>
  async (tx) => {
    const [record] = await tx
      .insert(chatSummary)
      .values({ ...data, createdAt: new Date() })
      .returning();
    return record;
  };

export async function getMessagesByChatId(chatId: string): Promise<Message[]> {
  return getDb()
    .select()
    .from(message)
    .where(eq(message.chatId, chatId))
    .orderBy(message.serial);
}

export async function getMessageById(id: string): Promise<Message | undefined> {
  const [record] = await getDb()
    .select()
    .from(message)
    .where(eq(message.id, id))
    .limit(1);
  return record;
}
