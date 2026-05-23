import "server-only";

import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/infrastructure/db/db";
import {
  chatSummary,
  type ChatSummary,
  type InsertChatSummary,
} from "@/lib/infrastructure/db/schema";
import type { Transactional } from "@/lib/infrastructure/db/queries";

export const saveSummary =
  (data: InsertChatSummary): Transactional<ChatSummary> =>
  async (tx) => {
    const [record] = await tx
      .insert(chatSummary)
      .values({ ...data, createdAt: new Date() })
      .returning();
    return record;
  };

export async function getLatestSummary(
  chatId: string,
): Promise<ChatSummary | undefined> {
  const [record] = await getDb()
    .select()
    .from(chatSummary)
    .where(eq(chatSummary.chatId, chatId))
    .orderBy(desc(chatSummary.createdAt))
    .limit(1);

  return record;
}

export async function getSummaryById(
  id: string,
): Promise<ChatSummary | undefined> {
  const [record] = await getDb()
    .select()
    .from(chatSummary)
    .where(eq(chatSummary.id, id));

  return record;
}
