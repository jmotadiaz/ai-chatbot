import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/infrastructure/db/db";
import {
  userMemory,
  type UserMemory,
  type InsertUserMemory,
} from "@/lib/infrastructure/db/schema";
import type { Transactional } from "@/lib/infrastructure/db/queries";

export const insertMemoryFact =
  (data: InsertUserMemory): Transactional<UserMemory> =>
  async (tx) => {
    const [record] = await tx
      .insert(userMemory)
      .values({ ...data, createdAt: new Date(), updatedAt: new Date() })
      .returning();
    return record;
  };

export const updateMemoryFact =
  ({
    id,
    content,
    embedding,
  }: {
    id: string;
    content: string;
    embedding: number[];
  }): Transactional<UserMemory> =>
  async (tx) => {
    const [record] = await tx
      .update(userMemory)
      .set({ content, embedding, updatedAt: new Date() })
      .where(eq(userMemory.id, id))
      .returning();
    return record;
  };

export const deleteMemoryFactsByUserId =
  ({ userId }: { userId: string }): Transactional<{ id: string }[]> =>
  async (tx) =>
    tx
      .delete(userMemory)
      .where(eq(userMemory.userId, userId))
      .returning({ id: userMemory.id });

export async function getPreferencesByUserId(
  userId: string,
): Promise<UserMemory[]> {
  return getDb()
    .select()
    .from(userMemory)
    .where(
      and(
        eq(userMemory.userId, userId),
        eq(userMemory.category, "preferences"),
      ),
    );
}

export async function findSimilarMemoryFacts({
  userId,
  embedding,
  similarityThreshold = 0.85,
  limit = 5,
  categories,
}: {
  userId: string;
  embedding: number[];
  similarityThreshold?: number;
  limit?: number;
  categories?: Array<"personal" | "professional" | "preferences">;
}): Promise<Array<UserMemory & { similarity: number }>> {
  const db = getDb();
  const distance = sql<number>`(${userMemory.embedding} <=> ${JSON.stringify(embedding)}::vector)`;
  const similarity = sql<number>`1 - (${userMemory.embedding} <=> ${JSON.stringify(embedding)}::vector)`;

  const conditions = [eq(userMemory.userId, userId)];
  if (categories && categories.length > 0) {
    conditions.push(inArray(userMemory.category, categories));
  }

  const rows = await db
    .select({
      id: userMemory.id,
      userId: userMemory.userId,
      category: userMemory.category,
      content: userMemory.content,
      embedding: userMemory.embedding,
      source: userMemory.source,
      createdAt: userMemory.createdAt,
      updatedAt: userMemory.updatedAt,
      similarity: similarity.as("similarity"),
    })
    .from(userMemory)
    .where(and(...conditions))
    .orderBy(distance)
    .limit(limit);

  return rows
    .filter((r) => r.similarity >= similarityThreshold)
    .map((r) => ({ ...r, similarity: r.similarity }));
}
