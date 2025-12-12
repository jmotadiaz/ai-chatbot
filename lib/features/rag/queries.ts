import "server-only";

import { and, desc, eq, gt, sql, notInArray, inArray } from "drizzle-orm";
import {
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
import { getDb } from "@/lib/db/db";
import { Transactional } from "@/lib/db/queries";

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
