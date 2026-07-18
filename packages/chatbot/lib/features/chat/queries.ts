import "server-only";

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import type {
  Chat,
  Message,
  InsertMessage,
  InsertChat,
} from "@/lib/infrastructure/db/schema";
import { chat, message } from "@/lib/infrastructure/db/schema";
import { getDb } from "@/lib/infrastructure/db/db";
import type {
  Transactional,
  SafeTransaction,
} from "@/lib/infrastructure/db/queries";

export const saveChat =
  ({
    id,
    userId,
    title,
    agent,
    defaultModel,
    defaultTemperature,
    defaultTopP,
    defaultTopK,

    ragMaxResources,
    minRagResourcesScore,

    webSearchNumResults,
    tools,
    projectId,
    pinned = false,
  }: InsertChat): Transactional<Chat> =>
  async (tx) => {
    try {
      const [createdChat] = await tx
        .insert(chat)
        .values({
          id,
          userId,
          title,
          agent,
          defaultModel,
          defaultTemperature,
          defaultTopP,
          defaultTopK,

          ragMaxResources,
          minRagResourcesScore,

          webSearchNumResults,
          tools,
          projectId,
          pinned,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      return createdChat;
    } catch (error) {
      console.error("Failed to save chat to database");
      throw error;
    }
  };

export const updateChat =
  (
    { id, userId }: SafeTransaction,
    partialChat: Partial<
      Pick<
        Chat,
        | "defaultModel"
        | "title"
        | "agent"
        | "defaultTemperature"
        | "defaultTopP"
        | "defaultTopK"
        | "webSearchNumResults"
        | "ragMaxResources"
        | "minRagResourcesScore"
        | "tools"
        | "projectId"
        | "pinned"
        | "updatedAt"
      >
    >,
  ): Transactional<Chat> =>
  async (tx) => {
    const [updatedChat] = await tx
      .update(chat)
      .set({
        updatedAt: new Date(),
        ...partialChat,
      })
      .where(and(eq(chat.id, id), eq(chat.userId, userId)))
      .returning();

    return updatedChat;
  };

export async function getChatById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}): Promise<Chat | undefined> {
  try {
    const [selectedChat] = await getDb()
      .select()
      .from(chat)
      .where(and(eq(chat.id, id), eq(chat.userId, userId)));
    return selectedChat;
  } catch (error) {
    console.error("Failed to get chat by id from database", error);
    return undefined;
  }
}

export const deleteChat =
  ({ id, userId }: SafeTransaction): Transactional<Chat | undefined> =>
  async (tx) => {
    await tx.delete(message).where(eq(message.chatId, id));
    const [chatsDeleted] = await tx
      .delete(chat)
      .where(and(eq(chat.id, id), eq(chat.userId, userId)))
      .returning();
    return chatsDeleted;
  };

export async function getChats({
  userId,
  limit,
  projectId = null,
}: {
  userId: string;
  limit: number;
  projectId?: string | null;
}): Promise<{ chats: Array<Chat> }> {
  try {
    const extendedLimit = limit + 1;

    const chats = await getDb()
      .select()
      .from(chat)
      .where(
        and(
          eq(chat.userId, userId),
          projectId === null
            ? isNull(chat.projectId)
            : eq(chat.projectId, projectId),
        ),
      )
      .orderBy(desc(chat.pinned), desc(chat.updatedAt))
      .limit(extendedLimit);

    return {
      chats,
    };
  } catch (error) {
    console.error("Failed to get chats by user from database");
    throw error;
  }
}

export const saveMessages =
  (messages: InsertMessage[]): Transactional<Array<Message>> =>
  (tx) => {
    try {
      return tx
        .insert(message)
        .values(
          messages.map(({ id, chatId, role, parts, metadata }) => ({
            id,
            chatId,
            role,
            parts,
            metadata,
            createdAt: new Date(),
          })),
        )
        .onConflictDoUpdate({
          target: message.id,
          set: {
            role: sql`excluded.role`,
            parts: sql`excluded.parts`,
          },
        })
        .returning();
    } catch (error) {
      console.error("Failed to save messages");
      throw error;
    }
  };

export const deleteMessageById =
  (id?: string): Transactional<Message | undefined> =>
  async (tx) => {
    if (!id) {
      return undefined;
    }
    const [deletedMessage] = await tx
      .delete(message)
      .where(eq(message.id, id))
      .returning();
    return deletedMessage;
  };

export async function getMessagesByChatId(id: string): Promise<Array<Message>> {
  try {
    return await getDb()
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.serial));
  } catch (error) {
    console.error("Failed to get messages by chat id from database", error);
    throw error;
  }
}
