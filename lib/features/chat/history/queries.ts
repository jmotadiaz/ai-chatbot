import "server-only";

import { and, desc, eq, isNull, ilike } from "drizzle-orm";

import { chat, Chat } from "@/lib/infrastructure/db/schema";
import { getDb } from "@/lib/infrastructure/db/db";

export async function getHistoryChats({
  userId,
  limit,
  offset,
  filter,
}: {
  userId: string;
  limit: number;
  offset: number;
  filter?: string;
}): Promise<{ chats: Array<Chat>; hasMore: boolean }> {
  try {
    const extendedLimit = limit + 1;

    const whereClause = and(
      eq(chat.userId, userId),
      // We generally only show "root" chats in history, consistent with getChats in sidebar?
      // getChats in queries.ts filters by projectId. Sidebar only shows "chats" (projectId is null or specific).
      // The requirement says "See all" from the sidebar which usually lists main chats (no project).
      // However, the "See all" usually implies "all chats I can see in the sidebar".
      // Sidebar implementation:
      // const { chats } = await getChats({ userId: session.user.id, limit: 20 });
      // getChats defaults projectId to null if not provided.
      // So I should probably filter by projectId IS NULL to match the sidebar's "main" chat list.
      // Or should I show ALL chats including project chats?
      // "See all" usually refers to the list it is attached to.
      // The sidebar ChatList is for "Chats" (no project). Project chats are in ProjectList.
      // So I will filter for projectId IS NULL.
      isNull(chat.projectId),
      filter ? ilike(chat.title, `%${filter}%`) : undefined
    );

    const chats = await getDb()
      .select()
      .from(chat)
      .where(whereClause)
      .orderBy(desc(chat.updatedAt))
      .limit(extendedLimit)
      .offset(offset);

    const hasMore = chats.length > limit;
    const poppedChats = hasMore ? chats.slice(0, limit) : chats;

    return {
      chats: poppedChats,
      hasMore,
    };
  } catch (error) {
    console.error("Failed to get history chats from database");
    throw error;
  }
}
