import "server-only";

import {
  and,
  desc,
  eq,
  gt,
  ilike,
  sql,
  notInArray,
  inArray,
} from "drizzle-orm";
import {
  resource,
  chunk,
  embedding,
  projectResource,
  type Resource,
  type Chunk,
  type Embedding,
  type InsertResource,
  type InsertChunk,
  type InsertEmbedding,
} from "@/lib/infrastructure/db/schema";
import { getDb } from "@/lib/infrastructure/db/db";
import { Transactional } from "@/lib/infrastructure/db/queries";

export const saveResource =
  (
    data: InsertResource & { userId?: string | null; projectId?: string },
  ): Transactional<Resource> =>
  async (tx) => {
    try {
      const [newResource] = await tx
        .insert(resource)
        .values({
          ...data,
          userId: data.userId ?? null, // Ensure explicit null if undefined
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      if (data.projectId) {
        await tx.insert(projectResource).values({
          projectId: data.projectId,
          resourceId: newResource.id,
        });
      }

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
  content: string;
  type: string;
  language: string | null;
  boundaryType: string | null;
  boundaryName: string | null;
};

export type SimilarChunks = Array<SimilarChunk>;

/**
 * Optimized semantic search that executes multiple vector searches in a single db.batch call.
 * More efficient than individual queries as it reduces network round-trips.
 */
export async function findSimilarChunksBySemantic({
  embeddings,
  userId,
  projectId,
  limitByQuery: limit = 10,
  similarityThreshold = 0.6,
  previousChunkIds = [],
}: {
  embeddings: number[][];
  userId: string;
  projectId?: string;
  limitByQuery?: number;
  similarityThreshold?: number;
  previousChunkIds?: string[];
}): Promise<SimilarChunks> {
  if (embeddings.length === 0) return [];

  try {
    const db = getDb();

    // Execute all queries within a single transaction
    const batchResults = await db.transaction<SimilarChunks[]>(async (tx) => {
      // Re-build queries using the transaction context (tx)
      const txQueries = embeddings.map((queryEmbedding) => {
        // 1. Calculate similarity/distance
        // Note: We use distance for the inner KNN search (ORDER BY distance ASC)
        // and similarity for filtering/final sorting (1 - distance)
        const distance = sql<number>`(${embedding.embedding} <=> ${JSON.stringify(
          queryEmbedding,
        )}::vector)`;
        const similarity = sql<number>`1 - ${distance}`;

        // 2. Base conditions for the INNER query
        const whereConditions = [];

        if (previousChunkIds.length > 0) {
          whereConditions.push(notInArray(chunk.id, previousChunkIds));
        }

        if (projectId) {
          whereConditions.push(eq(projectResource.projectId, projectId));
        } else {
          whereConditions.push(eq(resource.userId, userId));
        }

        // 3. Inner Query: Efficient KNN Vector Search
        // Fetch more candidates (oversampling) to allow for deduplication later
        let innerQueryBuilder = tx
          .select({
            id: chunk.id,
            resourceUrl: sql<string | null>`${resource.url}`.as("resourceUrl"),
            content: chunk.content,
            distance: distance.as("distance"),
            similarity: similarity.as("similarity"), // Keep this for outer usage
            resourceTitle: sql<string>`${resource.title}`.as("resourceTitle"),
            type: chunk.type,
            language: chunk.language,
            boundaryType: chunk.boundaryType,
            boundaryName: chunk.boundaryName,
          })
          .from(embedding)
          .innerJoin(chunk, eq(embedding.chunkId, chunk.id))
          .innerJoin(resource, eq(chunk.resourceId, resource.id));

        if (projectId) {
          innerQueryBuilder = innerQueryBuilder.innerJoin(
            projectResource,
            eq(resource.id, projectResource.resourceId),
          );
        }

        const innerQuery = innerQueryBuilder
          .where(and(...whereConditions))
          .orderBy(distance) // KNN optimization requires ORDER BY distance ASC
          .limit(limit * 40) // Fetch 5x candidates
          .as("inner_sq");

        // 4. Middle Query: Deduplicate & Filter
        // Use DISTINCT ON (id) to remove duplicates from the candidates
        // Apply the similarity threshold check here (or in outer, but here is fine)
        const middleQuery = tx
          .selectDistinctOn([innerQuery.id], {
            id: innerQuery.id,
            resourceUrl: innerQuery.resourceUrl,
            content: innerQuery.content,
            similarity: innerQuery.similarity,
            resourceTitle: innerQuery.resourceTitle,
            type: innerQuery.type,
            language: innerQuery.language,
            boundaryType: innerQuery.boundaryType,
            boundaryName: innerQuery.boundaryName,
          })
          .from(innerQuery)
          .where(gt(innerQuery.similarity, similarityThreshold))
          .orderBy(innerQuery.id) // Required for DISTINCT ON
          .as("middle_sq");

        // 5. Outer Query: Final Sort & Limit
        // Sort by similarity DESC (most relevant) and apply the strict limit
        return tx
          .select()
          .from(middleQuery)
          .orderBy(desc(middleQuery.similarity))
          .limit(limit);
      });

      // Execute all queries in parallel within the transaction
      return Promise.all(txQueries);
    });

    // Flatten and deduplicate results by chunk ID (in case multiple query embeddings found the same chunk)
    const allChunks = batchResults.flat();
    const uniqueChunks = Array.from(
      new Map<string, SimilarChunk>(
        allChunks.map((item: SimilarChunk) => [item.id, item]), // Keep type assertions to match minimal changes if needed, though mostly inferred
      ).values(),
    );

    return uniqueChunks;
  } catch (error) {
    console.error("Failed to find similar chunks by semantic batch", error);
    throw error;
  }
}

/**
 * Optimized keyword search that combines multiple queries into a single SQL statement.
 * Uses OR logic across all queries for efficient GIN index utilization.
 */
export async function findSimilarChunksByKeyword({
  queries,
  userId,
  projectId,
  limitByQuery: limit = 10,
  previousChunkIds = [],
}: {
  queries: string[];
  userId: string;
  projectId?: string;
  limitByQuery?: number;
  previousChunkIds?: string[];
}): Promise<SimilarChunks> {
  if (queries.length === 0) return [];

  try {
    const db = getDb();

    // Execute all queries within a single transaction
    const batchResults = await db.transaction<SimilarChunks[]>(async (tx) => {
      const txQueries = queries.map((query) => {
        // Build the tsquery for a single query string
        // "who is ceo" => "who | is | ceo"
        const formattedQuery = query
          .trim()
          .split(/[\s,]+/)
          .filter(Boolean)
          .join(" | ");

        const searchTerms = sql`to_tsquery('english', ${formattedQuery})`;
        const rank = sql<number>`ts_rank(${chunk.vectorSearch}, ${searchTerms})`;
        const whereConditions = [sql`${chunk.vectorSearch} @@ ${searchTerms}`];

        if (projectId) {
          whereConditions.push(eq(projectResource.projectId, projectId));
        } else {
          whereConditions.push(eq(resource.userId, userId));
        }

        if (previousChunkIds.length > 0) {
          whereConditions.push(notInArray(chunk.id, previousChunkIds));
        }

        let queryBuilder = tx
          .select({
            id: chunk.id,
            resourceUrl: sql<string | null>`${resource.url}`.as("resourceUrl"),
            content: chunk.content,
            similarity: rank.as("similarity"),
            resourceTitle: sql<string>`${resource.title}`.as("resourceTitle"),
            type: chunk.type,
            language: chunk.language,
            boundaryType: chunk.boundaryType,
            boundaryName: chunk.boundaryName,
          })
          .from(chunk)
          .innerJoin(resource, eq(chunk.resourceId, resource.id));

        if (projectId) {
          queryBuilder = queryBuilder.innerJoin(
            projectResource,
            eq(resource.id, projectResource.resourceId),
          );
        }

        return queryBuilder
          .where(and(...whereConditions))
          .orderBy(desc(rank))
          .limit(limit);
      });

      return Promise.all(txQueries);
    });

    const allChunks = batchResults.flat();

    const uniqueChunks = Array.from(
      new Map<string, SimilarChunk>(
        allChunks.map((item) => [item.id, item]),
      ).values(),
    );

    return uniqueChunks;
  } catch (error) {
    console.error("Failed to find similar chunks by keyword batch", error);
    throw error;
  }
}

export const deleteResources =
  ({ userId }: { userId: string }): Transactional<Resource[]> =>
  async (tx) =>
    tx.delete(resource).where(eq(resource.userId, userId)).returning();

export async function getUniqueResourceTitlesByUserId(
  userId: string,
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

export async function getUserResourcesPaginated({
  userId,
  limit,
  offset,
  filter,
}: {
  userId: string;
  limit: number;
  offset: number;
  filter?: string;
}): Promise<{
  items: Array<{ id: string; title: string; url: string | null }>;
  hasMore: boolean;
}> {
  try {
    const extendedLimit = limit + 1;
    const words = (filter ?? "").trim().split(/\s+/).filter(Boolean);

    const whereClause = and(
      eq(resource.userId, userId),
      ...words.map((w) => ilike(resource.title, `%${w}%`)),
    );

    const rows = await getDb()
      .select({
        id: resource.id,
        title: resource.title,
        url: resource.url,
      })
      .from(resource)
      .where(whereClause)
      .orderBy(desc(resource.updatedAt), desc(resource.id))
      .limit(extendedLimit)
      .offset(offset);

    const hasMore = rows.length > limit;
    return {
      items: hasMore ? rows.slice(0, limit) : rows,
      hasMore,
    };
  } catch (error) {
    console.error("Failed to get paginated user resources");
    throw error;
  }
}

export const deleteResourcesByTitleFilter =
  ({
    userId,
    filter,
  }: {
    userId: string;
    filter: string;
  }): Transactional<Resource[]> =>
  async (tx) => {
    try {
      const words = filter.trim().split(/\s+/).filter(Boolean);

      const whereClause = and(
        eq(resource.userId, userId),
        ...words.map((w) => ilike(resource.title, `%${w}%`)),
      );

      return await tx.delete(resource).where(whereClause).returning();
    } catch (error) {
      console.error("Failed to delete resources by title filter");
      throw error;
    }
  };

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

export const deleteResourcesByIds =
  ({
    ids,
    userId,
  }: {
    ids: string[];
    userId: string;
  }): Transactional<{ id: string }[]> =>
  async (tx) => {
    try {
      return await tx
        .delete(resource)
        .where(and(inArray(resource.id, ids), eq(resource.userId, userId)))
        .returning({ id: resource.id });
    } catch (error) {
      console.error("Failed to delete resources by ids");
      throw error;
    }
  };

// Project Resource queries

export const addResourceToProject =
  ({
    projectId,
    resourceId,
  }: {
    projectId: string;
    resourceId: string;
  }): Transactional<{ id: string }> =>
  async (tx) => {
    try {
      // Check if already linked
      const existing = await tx
        .select({ id: projectResource.id })
        .from(projectResource)
        .where(
          and(
            eq(projectResource.projectId, projectId),
            eq(projectResource.resourceId, resourceId),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        return existing[0];
      }

      const [result] = await tx
        .insert(projectResource)
        .values({
          projectId,
          resourceId,
        })
        .returning({ id: projectResource.id });
      return result;
    } catch (error) {
      console.error("Failed to add resource to project");
      throw error;
    }
  };

export const removeResourceFromProject =
  ({
    projectId,
    resourceId,
  }: {
    projectId: string;
    resourceId: string;
  }): Transactional<{ id: string }[]> =>
  async (tx) => {
    try {
      return await tx
        .delete(projectResource)
        .where(
          and(
            eq(projectResource.projectId, projectId),
            eq(projectResource.resourceId, resourceId),
          ),
        )
        .returning({ id: projectResource.id });
    } catch (error) {
      console.error("Failed to remove resource from project");
      throw error;
    }
  };

export async function getResourceById(
  resourceId: string,
): Promise<{ id: string; userId: string | null } | null> {
  try {
    const [result] = await getDb()
      .select({ id: resource.id, userId: resource.userId })
      .from(resource)
      .where(eq(resource.id, resourceId))
      .limit(1);
    return result ?? null;
  } catch (error) {
    console.error("Failed to get resource by id");
    throw error;
  }
}

export const deleteResourceById =
  ({ resourceId }: { resourceId: string }): Transactional<{ id: string }[]> =>
  async (tx) => {
    try {
      return await tx
        .delete(resource)
        .where(eq(resource.id, resourceId))
        .returning({ id: resource.id });
    } catch (error) {
      console.error("Failed to delete resource by id");
      throw error;
    }
  };

export async function getProjectResourcesPaginated({
  projectId,
  limit,
  offset,
  filter,
}: {
  projectId: string;
  limit: number;
  offset: number;
  filter?: string;
}): Promise<{
  items: Array<{ id: string; title: string; url: string | null }>;
  hasMore: boolean;
}> {
  try {
    const extendedLimit = limit + 1;
    const words = (filter ?? "").trim().split(/\s+/).filter(Boolean);

    const whereClause = and(
      eq(projectResource.projectId, projectId),
      ...words.map((w) => ilike(resource.title, `%${w}%`)),
    );

    const rows = await getDb()
      .select({
        id: resource.id,
        title: resource.title,
        url: resource.url,
      })
      .from(projectResource)
      .innerJoin(resource, eq(projectResource.resourceId, resource.id))
      .where(whereClause)
      .orderBy(desc(resource.updatedAt), desc(resource.id))
      .limit(extendedLimit)
      .offset(offset);

    const hasMore = rows.length > limit;
    return {
      items: hasMore ? rows.slice(0, limit) : rows,
      hasMore,
    };
  } catch (error) {
    console.error("Failed to get project resources paginated");
    throw error;
  }
}

export async function getUserResourcesNotInProject({
  userId,
  projectId,
  limit,
  offset,
  filter,
}: {
  userId: string;
  projectId: string;
  limit: number;
  offset: number;
  filter?: string;
}): Promise<{
  items: Array<{ id: string; title: string; url: string | null }>;
  hasMore: boolean;
}> {
  try {
    const extendedLimit = limit + 1;
    const words = (filter ?? "").trim().split(/\s+/).filter(Boolean);

    // Get resource IDs already in project
    const projectResourceIds = getDb()
      .select({ resourceId: projectResource.resourceId })
      .from(projectResource)
      .where(eq(projectResource.projectId, projectId));

    const whereClause = and(
      eq(resource.userId, userId),
      notInArray(resource.id, projectResourceIds),
      ...words.map((w) => ilike(resource.title, `%${w}%`)),
    );

    const rows = await getDb()
      .select({
        id: resource.id,
        title: resource.title,
        url: resource.url,
      })
      .from(resource)
      .where(whereClause)
      .orderBy(desc(resource.updatedAt), desc(resource.id))
      .limit(extendedLimit)
      .offset(offset);

    const hasMore = rows.length > limit;
    return {
      items: hasMore ? rows.slice(0, limit) : rows,
      hasMore,
    };
  } catch (error) {
    console.error("Failed to get user resources not in project");
    throw error;
  }
}
