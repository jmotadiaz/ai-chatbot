// eslint-disable import-x/no-unresolved
import "server-only";

import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";

import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  Chat,
  Message,
  InsertMessage,
  InsertChat,
  InsertProject,
  chat,
  message,
  user,
  type User,
  project,
  type Project,
  resources,
  embeddings,
  type Resource,
  type Embedding,
  type InsertResource,
  type InsertEmbedding,
} from "@/lib/db/schema";
import { generateHashedPassword } from "@/lib/db/utils";
import type { schema } from "@/lib/db/db";
import { getDb } from "@/lib/db/db";

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
    return getDb().transaction(async (tx) => {
      return Promise.all(fns.map((fn) => fn(tx)));
    });
  } catch (error) {
    console.error("Failed to execute transaction", error);
    throw error;
  }
}

export function getUser(email: string): Promise<Array<User>> {
  try {
    return getDb().select().from(user).where(eq(user.email, email));
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
    const [selectedChat] = await getDb()
      .select()
      .from(chat)
      .where(eq(chat.id, id));
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
            : eq(chat.projectId, projectId)
        )
      )
      .orderBy(desc(chat.updatedAt))
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
          }))
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
    const [selectedProject] = await getDb()
      .select()
      .from(project)
      .where(eq(project.id, id));
    return selectedProject;
  } catch (error) {
    console.error("Failed to get project by id from database", error);
    return undefined;
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
      return await getDb().query.project.findMany({
        where: eq(project.userId, userId),
        with: {
          chats: {
            orderBy: desc(chat.updatedAt),
            limit: 20,
          },
        },
        orderBy: desc(project.updatedAt),
        limit,
        offset,
      });
    } else {
      return await getDb()
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

export type SimilarChunk = Pick<Embedding, "content"> & {
  id: string;
  similarity: number;
  resourceTitle: string;
  resourceUrl: string | null;
  embeddingId: string;
};

export type SimilarChunks = Array<SimilarChunk>;

export async function findSimilarChunks({
  embedding,
  userId,
  limit = 5,
  similarityThreshold = 0.7,
  excludeEmbeddingIds = [],
}: {
  embedding: number[];
  userId: string;
  limit?: number;
  similarityThreshold?: number; // value between 0 and 1
  excludeEmbeddingIds?: string[];
}): Promise<SimilarChunks> {
  try {
    const similarity = sql<number>`1 - (${
      embeddings.embedding
    } <=> ${JSON.stringify(embedding)}::vector)`;

    const whereConditions = [
      gt(similarity, similarityThreshold),
      eq(resources.userId, userId),
    ];

    // Add exclusion condition if embedding IDs are provided
    if (excludeEmbeddingIds.length > 0) {
      whereConditions.push(
        sql`${embeddings.id} NOT IN (${sql.raw(
          excludeEmbeddingIds.map((id) => `'${id}'`).join(", ")
        )})`
      );
    }

    return await getDb()
      .select({
        id: embeddings.id,
        resourceUrl: resources.url,
        content: embeddings.content,
        similarity,
        resourceTitle: resources.title,
        embeddingId: embeddings.id,
      })
      .from(embeddings)
      .innerJoin(resources, eq(embeddings.resourceId, resources.id))
      .where(and(...whereConditions))
      .orderBy(desc(similarity))
      .limit(limit);
  } catch (error) {
    console.error("Failed to find similar chunks");
    throw error;
  }
}

export const deleteResources =
  ({ userId }: { userId: string }): Transactional<Resource[]> =>
  async (tx) =>
    tx.delete(resources).where(eq(resources.userId, userId)).returning();

export async function getUniqueResourceTitlesByUserId(
  userId: string
): Promise<Array<{ title: string; url: string | null }>> {
  try {
    return await getDb()
      .selectDistinctOn([resources.title], {
        title: resources.title,
        url: resources.url,
      })
      .from(resources)
      .where(eq(resources.userId, userId))
      .orderBy(resources.title);
  } catch (error) {
    console.error("Failed to get unique resource titles by user id");
    throw error;
  }
}

export const deleteResourcesByTitle =
  ({
    title,
    userId,
  }: {
    title: string;
    userId: string;
  }): Transactional<Resource[]> =>
  async (tx) => {
    try {
      return await tx
        .delete(resources)
        .where(and(eq(resources.title, title), eq(resources.userId, userId)))
        .returning();
    } catch (error) {
      console.error("Failed to delete resource by title");
      throw error;
    }
  };
