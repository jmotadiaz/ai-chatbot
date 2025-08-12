// eslint-disable import-x/no-unresolved
import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  ExtractTablesWithRelations,
  gt,
  isNull,
  lt,
  SQL,
  sql,
} from "drizzle-orm";
import { drizzle, PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { PgTransaction } from "drizzle-orm/pg-core";
import {
  Chat,
  chat,
  Message,
  message,
  user,
  type User,
  project,
  type Project,
  InsertMessage,
  InsertChat,
  InsertProject,
  projectRelations,
  chatRelations,
  messageRelations,
  resources,
  embeddings,
  type Resource,
  type Embedding,
  type InsertResource,
  type InsertEmbedding,
  resourcesRelations,
  embeddingsRelations,
} from "@/lib/db/schema";
import { generateHashedPassword } from "@/lib/db/utils";

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);

// Define the schema for drizzle
const schema = {
  user,
  chat,
  message,
  project,
  resources,
  embeddings,
  projectRelations,
  chatRelations,
  messageRelations,
  resourcesRelations,
  embeddingsRelations,
} as const;

const db = drizzle(client, { schema });

interface SafeTransaction {
  id: string;
  userId: string;
}

export type Transactional<T = unknown> = (
  tx: PgTransaction<
    PostgresJsQueryResultHKT,
    typeof schema,
    ExtractTablesWithRelations<typeof schema>
  >
) => Promise<T>;

// Helper type to extract the return type from a Transactional
type ExtractTransactionalType<T> = T extends Transactional<infer U> ? U : never;

export function transaction<
  T extends readonly [Transactional<unknown>, ...Transactional<unknown>[]]
>(...fns: T): Promise<{ [K in keyof T]: ExtractTransactionalType<T[K]> }>;

export function transaction(
  ...fns: Transactional<unknown>[]
): Promise<unknown> {
  try {
    return db.transaction(async (tx) => {
      return Promise.all(fns.map((fn) => fn(tx)));
    });
  } catch (error) {
    console.error("Failed to execute transaction", error);
    throw error;
  }
}

export function getUser(email: string): Promise<Array<User>> {
  try {
    return db.select().from(user).where(eq(user.email, email));
  } catch (error) {
    console.error("Failed to get user from database");
    throw error;
  }
}

export const createUser =
  (email: string, password: string): Transactional<Array<User>> =>
  (tx) => {
    const hashedPassword = generateHashedPassword(password);
    return tx
      .insert(user)
      .values({ email, password: hashedPassword })
      .returning();
  };

export const saveChat =
  ({
    id,
    userId,
    title,
    defaultModel,
    defaultTemperature,
    defaultTopP,
    defaultTopK,
    tools,
    projectId,
  }: InsertChat): Transactional<Chat> =>
  async (tx) => {
    try {
      const [createdChat] = await tx
        .insert(chat)
        .values({
          id,
          userId,
          title,
          defaultModel,
          defaultTemperature,
          defaultTopP,
          defaultTopK,
          tools,
          projectId,
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
        | "defaultTemperature"
        | "defaultTopP"
        | "defaultTopK"
        | "tools"
        | "projectId"
      >
    >
  ): Transactional<Chat> =>
  async (tx) => {
    const [updatedChat] = await tx
      .update(chat)
      .set({
        ...partialChat,
        updatedAt: new Date(),
      })
      .where(and(eq(chat.id, id), eq(chat.userId, userId)))
      .returning();

    return updatedChat;
  };

export async function getChatById(id: string): Promise<Chat | undefined> {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    return selectedChat;
  } catch (error) {
    console.error("Failed to get chat by id from database");
    throw error;
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
  startingAfter = null,
  endingBefore = null,
  projectId = null,
}: {
  userId: string;
  limit: number;
  startingAfter?: string | null;
  endingBefore?: string | null;
  projectId?: string | null;
}): Promise<{ chats: Array<Chat>; hasMore: boolean }> {
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

export const saveMessages =
  (messages: InsertMessage[]): Transactional<Array<Message>> =>
  (tx) => {
    try {
      return tx
        .insert(message)
        .values(
          messages.map(({ id, chatId, role, parts, attachments }) => ({
            id,
            chatId,
            role,
            parts,
            attachments,
            createdAt: new Date(),
          }))
        )
        .onConflictDoUpdate({
          target: message.id,
          set: {
            role: sql`excluded.role`,
            parts: sql`excluded.parts`,
            attachments: sql`excluded.attachments`,
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
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.serial));
  } catch (error) {
    console.error("Failed to get messages by chat id from database", error);
    throw error;
  }
}

export const createProject =
  ({
    userId,
    name,
    defaultModel,
    defaultTemperature,
    defaultTopP,
    defaultTopK,
    systemPrompt,
    hasPromptRefiner,
    tools,
  }: InsertProject): Transactional<Project> =>
  (tx) => {
    return tx
      .insert(project)
      .values({
        userId,
        name,
        defaultModel,
        defaultTemperature,
        defaultTopP,
        defaultTopK,
        systemPrompt,
        hasPromptRefiner,
        tools,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()
      .then(([newProject]) => newProject);
  };

export async function getProjectById(id: string): Promise<Project | undefined> {
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

interface GetProjectByUserIdParams {
  userId: string;
  limit?: number;
  offset?: number;
}

export async function getProjectsByUserId(
  params: GetProjectByUserIdParams & { joinChats?: false }
): Promise<Array<Project>>;
export async function getProjectsByUserId(
  params: GetProjectByUserIdParams & { joinChats: true }
): Promise<Array<Project & { chats: Array<Chat> }>>;
export async function getProjectsByUserId({
  userId,
  joinChats = false,
  limit = 50,
  offset = 0,
}: GetProjectByUserIdParams & { joinChats?: boolean }): Promise<
  Array<Project> | Array<Project & { chats: Array<Chat> }>
> {
  try {
    if (joinChats) {
      return await db.query.project.findMany({
        where: eq(project.userId, userId),
        with: {
          chats: true,
        },
        orderBy: desc(project.updatedAt),
        limit,
        offset,
      });
    } else {
      return await db
        .select()
        .from(project)
        .where(eq(project.userId, userId))
        .orderBy(desc(project.updatedAt))
        .limit(limit)
        .offset(offset);
    }
  } catch (error) {
    console.error("Failed to get projects by user id from database");
    throw error;
  }
}

export const updateProject =
  (
    { id, userId }: SafeTransaction,
    updateProjectData: Partial<Omit<InsertProject, "userId">>
  ): Transactional<Project | undefined> =>
  (tx) => {
    return tx
      .update(project)
      .set({
        ...updateProjectData,
        updatedAt: new Date(),
      })
      .where(and(eq(project.id, id), eq(project.userId, userId)))
      .returning()
      .then(([updatedProject]) => updatedProject);
  };

export const deleteProject =
  ({ id, userId }: SafeTransaction): Transactional<Project | undefined> =>
  (tx) => {
    return tx
      .delete(project)
      .where(and(eq(project.id, id), eq(project.userId, userId)))
      .returning()
      .then(([deletedProject]) => deletedProject);
  };

// RAG Database Operations

export const createResource =
  (data: InsertResource & { userId: string }): Transactional<Resource> =>
  async (tx) => {
    try {
      const [newResource] = await tx
        .insert(resources)
        .values({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      return newResource;
    } catch (error) {
      console.error("Failed to create resource");
      throw error;
    }
  };

export const createEmbeddings =
  (data: InsertEmbedding[]): Transactional<Embedding[]> =>
  async (tx) => {
    try {
      return await tx.insert(embeddings).values(data).returning();
    } catch (error) {
      console.error("Failed to create embeddings");
      throw error;
    }
  };

export type SimilarChunks = Array<
  Embedding & { similarity: number; resourceTitle: string }
>;

export async function findSimilarChunks({
  embedding,
  userId,
  limit = 5,
}: {
  embedding: number[];
  userId: string;
  limit?: number;
}): Promise<SimilarChunks> {
  try {
    const similarity = sql<number>`1 - (${
      embeddings.embedding
    } <=> ${JSON.stringify(embedding)}::vector)`;

    return await db
      .select({
        id: embeddings.id,
        resourceId: embeddings.resourceId,
        content: embeddings.content,
        embedding: embeddings.embedding,
        similarity,
        resourceTitle: resources.title,
      })
      .from(embeddings)
      .innerJoin(resources, eq(embeddings.resourceId, resources.id))
      .where(and(gt(similarity, 0.6), eq(resources.userId, userId)))
      .orderBy(desc(similarity))
      .limit(limit);
  } catch (error) {
    console.error("Failed to find similar chunks");
    throw error;
  }
}

export const deleteResources = async () => {
  return db.delete(resources);
};
