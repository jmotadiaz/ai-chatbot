import "server-only";

import { and, asc, desc, eq, gt, isNull, lt, SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  Chat,
  chat,
  Message,
  message,
  user,
  type User,
  project,
  type Project,
} from "./schema";
import { generateHashedPassword } from "./utils";

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

export async function getUser(email: string): Promise<Array<User>> {
  try {
    return await db.select().from(user).where(eq(user.email, email));
  } catch (error) {
    console.error("Failed to get user from database");
    throw error;
  }
}

export async function createUser(email: string, password: string) {
  const hashedPassword = generateHashedPassword(password);

  try {
    return await db.insert(user).values({ email, password: hashedPassword });
  } catch (error) {
    console.error("Failed to create user in database");
    throw error;
  }
}

export async function saveChat({
  id,
  userId,
  projectId,
  title,
  defaultModel,
  defaultTemperature,
  defaultTopP,
}: {
  id: string;
  userId: string;
  defaultModel: string;
  title: string;
  projectId?: string;
  defaultTemperature?: number;
  defaultTopP?: number;
}) {
  try {
    return await db.insert(chat).values({
      id,
      userId,
      projectId,
      title,
      defaultModel,
      defaultTemperature,
      defaultTopP,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("Failed to save chat in database");
    throw error;
  }
}

export const updateChat = async (
  id: string,
  {
    title,
    defaultModel,
    defaultTemperature,
    defaultTopP,
  }: Partial<
    Pick<Chat, "defaultModel" | "title" | "defaultTemperature" | "defaultTopP">
  >
) => {
  try {
    const updateData: Partial<Chat> = {
      updatedAt: new Date(),
      title,
      defaultModel,
      defaultTemperature,
      defaultTopP,
    };

    const [updatedChat] = await db
      .update(chat)
      .set(updateData)
      .where(and(eq(chat.id, id)))
      .returning();
    return updatedChat;
  } catch (error) {
    console.error("Failed to update chat in database");
    throw error;
  }
};

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    return selectedChat;
  } catch (error) {
    console.error("Failed to get chat by id from database");
    throw error;
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    await db.delete(message).where(eq(message.chatId, id));

    const [chatsDeleted] = await db
      .delete(chat)
      .where(eq(chat.id, id))
      .returning();
    return chatsDeleted;
  } catch (error) {
    console.error("Failed to delete chat by id from database");
    throw error;
  }
}

export async function getChats({
  userId,
  limit,
  startingAfter = null,
  endingBefore = null,
  projectId = null,
}: {
  userId: string;
  limit: number;
  startingAfter?: string | null;
  endingBefore?: string | null;
  projectId?: string | null;
}) {
  try {
    const extendedLimit = limit + 1;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query = (whereCondition?: SQL<any>) =>
      db
        .select()
        .from(chat)
        .where(
          whereCondition
            ? and(
                whereCondition,
                eq(chat.userId, userId),
                projectId === null
                  ? isNull(chat.projectId)
                  : eq(chat.projectId, projectId)
              )
            : and(
                eq(chat.userId, userId),
                projectId === null
                  ? isNull(chat.projectId)
                  : eq(chat.projectId, projectId)
              )
        )
        .orderBy(desc(chat.createdAt))
        .limit(extendedLimit);

    let filteredChats: Array<Chat> = [];

    if (startingAfter) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, startingAfter))
        .limit(1);

      if (!selectedChat) {
        throw new Error(`Chat with id ${startingAfter} not found`);
      }

      filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
    } else if (endingBefore) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, endingBefore))
        .limit(1);

      if (!selectedChat) {
        throw new Error(`Chat with id ${endingBefore} not found`);
      }

      filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
    } else {
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (error) {
    console.error("Failed to get chats by user from database");
    throw error;
  }
}

export async function saveMessages({ messages }: { messages: Array<Message> }) {
  try {
    return await db.insert(message).values(messages);
  } catch (error) {
    console.error("Failed to save messages in database", error);
    throw error;
  }
}

export async function updateMessage(
  id: string,
  { role, parts, attachments }: Partial<Omit<Message, "id">>
) {
  try {
    return await db
      .update(message)
      .set({
        role,
        parts,
        attachments,
      })
      .where(eq(message.id, id))
      .returning();
  } catch (error) {
    console.error("Failed to update message in database", error);
    throw error;
  }
}

export async function updateMessages({
  messages,
}: {
  messages: Array<Message>;
}) {
  try {
    return await db.transaction(async (tx) => {
      const updatedMessages = [];

      for (const msg of messages) {
        const [updatedMessage] = await tx
          .update(message)
          .set({
            role: msg.role,
            parts: msg.parts,
            attachments: msg.attachments,
          })
          .where(eq(message.id, msg.id))
          .returning();

        updatedMessages.push(updatedMessage);
      }

      return updatedMessages;
    });
  } catch (error) {
    console.error("Failed to update messages in database", error);
    throw error;
  }
}

export async function deleteMessagesById({
  id,
}: {
  id: string;
}): Promise<Array<Message>> {
  try {
    return await db.delete(message).where(eq(message.id, id)).returning();
  } catch (error) {
    console.error("Failed to delete message by id from database", error);
    throw error;
  }
}

export async function getMessagesByChatId({
  id,
}: {
  id: string;
}): Promise<Array<Message>> {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (error) {
    console.error("Failed to get messages by chat id from database", error);
    throw error;
  }
}

export async function createProject({
  userId,
  name,
  defaultModel,
  defaultTemperature,
  defaultTopP,
  systemPrompt,
  metaPrompt,
  tools,
}: {
  userId: string;
  name: string;
  defaultModel?: string;
  defaultTemperature?: number;
  defaultTopP?: number;
  systemPrompt: string;
  metaPrompt?: string;
  tools?: string[];
}) {
  try {
    const [newProject] = await db
      .insert(project)
      .values({
        userId,
        name,
        defaultModel,
        defaultTemperature,
        defaultTopP,
        systemPrompt,
        metaPrompt,
        tools,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return newProject;
  } catch (error) {
    console.error("Failed to create project in database");
    throw error;
  }
}

export async function getProjectById({ id }: { id: string }) {
  try {
    const [selectedProject] = await db
      .select()
      .from(project)
      .where(eq(project.id, id));
    return selectedProject;
  } catch (error) {
    console.error("Failed to get project by id from database");
    throw error;
  }
}

export async function getProjectsByUserId({
  userId,
  limit = 50,
  offset = 0,
}: {
  userId: string;
  limit?: number;
  offset?: number;
}) {
  try {
    const projects = await db
      .select()
      .from(project)
      .where(eq(project.userId, userId))
      .orderBy(desc(project.updatedAt))
      .limit(limit)
      .offset(offset);
    return projects;
  } catch (error) {
    console.error("Failed to get projects by user id from database");
    throw error;
  }
}

export async function updateProject({
  id,
  userId,
  name,
  defaultModel,
  defaultTemperature,
  defaultTopP,
  systemPrompt,
  metaPrompt,
  tools,
}: {
  id: string;
  userId: string;
  name?: string;
  defaultModel?: string;
  defaultTemperature?: number;
  defaultTopP?: number;
  systemPrompt?: string;
  metaPrompt?: string;
  tools?: string[];
}) {
  try {
    const updateData: Partial<Project> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (defaultModel !== undefined) updateData.defaultModel = defaultModel;
    if (defaultTemperature !== undefined)
      updateData.defaultTemperature = defaultTemperature;
    if (defaultTopP !== undefined) updateData.defaultTopP = defaultTopP;
    if (systemPrompt !== undefined) updateData.systemPrompt = systemPrompt;
    if (metaPrompt !== undefined) updateData.metaPrompt = metaPrompt;
    if (tools !== undefined) updateData.tools = tools;

    const [updatedProject] = await db
      .update(project)
      .set(updateData)
      .where(and(eq(project.id, id), eq(project.userId, userId)))
      .returning();
    return updatedProject;
  } catch (error) {
    console.error("Failed to update project in database");
    throw error;
  }
}

export async function deleteProject({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    const [deletedProject] = await db
      .delete(project)
      .where(and(eq(project.id, id), eq(project.userId, userId)))
      .returning();
    return deletedProject;
  } catch (error) {
    console.error("Failed to delete project from database");
    throw error;
  }
}
