import "server-only";

import { eq, desc } from "drizzle-orm";
import type { CompactionDbPort } from "../ports";
import { getDb } from "@/lib/infrastructure/db/db";
import {
  chatSummary,
  message,
  type InsertChatSummary,
} from "@/lib/infrastructure/db/schema";
import { transaction as dbTransaction } from "@/lib/infrastructure/db/queries";

export const compactionDbAdapter: CompactionDbPort = {
  getLatestSummary: async (chatId) => {
    const [record] = await getDb()
      .select()
      .from(chatSummary)
      .where(eq(chatSummary.chatId, chatId))
      .orderBy(desc(chatSummary.createdAt))
      .limit(1);
    return record;
  },

  saveSummary: (data: InsertChatSummary) =>
    async (tx) => {
      const [record] = await tx
        .insert(chatSummary)
        .values({ ...data, createdAt: new Date() })
        .returning();
      return record;
    },

  getMessagesByChatId: async (chatId) => {
    return getDb()
      .select()
      .from(message)
      .where(eq(message.chatId, chatId))
      .orderBy(message.serial);
  },

  getMessageById: async (id) => {
    const [record] = await getDb()
      .select()
      .from(message)
      .where(eq(message.id, id))
      .limit(1);
    return record;
  },

  transaction: (fn) => dbTransaction(fn) as Promise<never>,
};
