// eslint-disable import-x/no-unresolved
import "server-only";

import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, desc, eq, gt, sql, notInArray, inArray } from "drizzle-orm";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";

import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  user,
  type User,
  resource,
  chunk,
  embedding,
  type Resource,
  type Chunk,
  type Embedding,
  type InsertResource,
  type InsertChunk,
  type InsertEmbedding,
} from "@/lib/db/schema";
import { generateHashedPassword } from "@/lib/db/utils";
import type { schema } from "@/lib/db/db";
import { getDb } from "@/lib/db/db";

export interface SafeTransaction {
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

// RAG Database Operations

export const saveResource =
  (data: InsertResource & { userId: string }): Transactional<Resource> =>
  async (tx) => {
    try {
      const [newResource] = await tx
        .insert(resource)
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

export const saveChunks =
  (data: InsertChunk[]): Transactional<Chunk[]> =>
  async (tx) => {
    try {
      return await tx.insert(chunk).values(data).returning();
    } catch (error) {
      console.error("Failed to create chunks");
      throw error;
    }
  };

export const createEmbeddings =
  (data: InsertEmbedding[]): Transactional<Embedding[]> =>
  async (tx) => {
    try {
      return await tx.insert(embedding).values(data).returning();
    } catch (error) {
      console.error("Failed to create embeddings");
      throw error;
    }
  };

export type SimilarChunk = {
  id: string;
  similarity: number;
  resourceTitle: string;
  resourceUrl: string | null;
  embeddingId: string;
  content: string;
  type: string;
  language: string | null;
  boundaryType: string | null;
  boundaryName: string | null;
};

export type SimilarChunks = Array<SimilarChunk>;

export async function findSimilarChunks({
  embedding: queryEmbedding,
  userId,
  limit = 10,
  similarityThreshold = 0.6,
  previousChunkIds = [],
}: {
  embedding: number[];
  userId: string;
  limit?: number;
  similarityThreshold?: number; // value between 0 and 1
  previousChunkIds?: string[];
}): Promise<SimilarChunks> {
  try {
    const similarity = sql<number>`1 - (${
      embedding.embedding
    } <=> ${JSON.stringify(queryEmbedding)}::vector)`;

    const whereConditions = [
      gt(similarity, similarityThreshold),
      eq(resource.userId, userId),
    ];

    // Add exclusion condition if chunk contents (parents) are provided
    if (previousChunkIds.length > 0) {
      whereConditions.push(notInArray(chunk.id, previousChunkIds));
    }

    const results = await getDb()
      .select({
        id: chunk.id,
        resourceUrl: resource.url,
        content: chunk.content,
        similarity,
        resourceTitle: resource.title,
        embeddingId: embedding.id,
        type: chunk.type,
        language: chunk.language,
        boundaryType: chunk.boundaryType,
        boundaryName: chunk.boundaryName,
      })
      .from(embedding)
      .innerJoin(chunk, eq(embedding.chunkId, chunk.id))
      .innerJoin(resource, eq(chunk.resourceId, resource.id))
      .where(and(...whereConditions))
      .orderBy(desc(similarity))
      .limit(limit);

    return results;
  } catch (error) {
    console.error("Failed to find similar chunks");
    throw error;
  }
}

export const deleteResources =
  ({ userId }: { userId: string }): Transactional<Resource[]> =>
  async (tx) =>
    tx.delete(resource).where(eq(resource.userId, userId)).returning();

export async function getUniqueResourceTitlesByUserId(
  userId: string
): Promise<Array<{ title: string; url: string | null }>> {
  try {
    return await getDb()
      .selectDistinctOn([resource.title], {
        title: resource.title,
        url: resource.url,
      })
      .from(resource)
      .where(eq(resource.userId, userId))
      .orderBy(resource.title);
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
        .delete(resource)
        .where(and(eq(resource.title, title), eq(resource.userId, userId)))
        .returning();
    } catch (error) {
      console.error("Failed to delete resource by title");
      throw error;
    }
  };

export const deleteResourcesByTitles =
  ({
    titles,
    userId,
  }: {
    titles: string[];
    userId: string;
  }): Transactional<Resource[]> =>
  async (tx) => {
    try {
      return await tx
        .delete(resource)
        .where(
          and(inArray(resource.title, titles), eq(resource.userId, userId))
        )
        .returning();
    } catch (error) {
      console.error("Failed to delete resources by titles");
      throw error;
    }
  };
