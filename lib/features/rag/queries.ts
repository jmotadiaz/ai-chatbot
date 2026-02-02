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

export async function findSimilarChunks({
  embedding: queryEmbedding,
  userId,
  projectId,
  limit = 10,
  similarityThreshold = 0.6,
  previousChunkIds = [],
}: {
  embedding: number[];
  userId: string;
  projectId?: string;
  limit?: number;
  similarityThreshold?: number; // value between 0 and 1
  previousChunkIds?: string[];
}): Promise<SimilarChunks> {
  try {
    const similarity = sql<number>`1 - (${
      embedding.embedding
    } <=> ${JSON.stringify(queryEmbedding)}::vector)`;

    const whereConditions = [gt(similarity, similarityThreshold)];

    // Add exclusion condition if chunk contents (parents) are provided
    if (previousChunkIds.length > 0) {
      whereConditions.push(notInArray(chunk.id, previousChunkIds));
    }

    // Build base query
    // We use a subquery to first get the best embedding for each chunk (DISTINCT ON chunk.id)
    // and then limit the result in the outer query.

    // Condition handling for Project vs User scope
    if (projectId) {
      whereConditions.push(eq(projectResource.projectId, projectId));
    } else {
      whereConditions.push(eq(resource.userId, userId));
    }

    const subQueryBuilder = getDb()
      .selectDistinctOn([chunk.id], {
        id: chunk.id,
        resourceUrl: sql<string | null>`${resource.url}`.as("resourceUrl"),
        content: chunk.content,
        similarity: similarity.as("similarity"),
        resourceTitle: sql<string>`${resource.title}`.as("resourceTitle"),
        type: chunk.type,
        language: chunk.language,
        boundaryType: chunk.boundaryType,
        boundaryName: chunk.boundaryName,
      })
      .from(embedding)
      .innerJoin(chunk, eq(embedding.chunkId, chunk.id))
      .innerJoin(resource, eq(chunk.resourceId, resource.id));

    // Apply joins for projectId filtering if needed
    let subQuery;
    if (projectId) {
      subQuery = subQueryBuilder
        .innerJoin(projectResource, eq(resource.id, projectResource.resourceId))
        .where(and(...whereConditions))
        .orderBy(chunk.id, desc(similarity))
        .as("sq");
    } else {
      subQuery = subQueryBuilder
        .where(and(...whereConditions))
        .orderBy(chunk.id, desc(similarity))
        .as("sq");
    }

    const results = await getDb()
      .select()
      .from(subQuery)
      .orderBy(desc(subQuery.similarity))
      .limit(limit);

    return results;
  } catch (error) {
    console.error("Failed to find similar chunks", error);
    throw error;
  }
}

export async function findSimilarChunksByKeyword({
  query,
  userId,
  projectId,
  limit = 10,
  previousChunkIds = [],
}: {
  query: string;
  userId: string;
  projectId?: string;
  limit?: number;
  previousChunkIds?: string[];
}): Promise<SimilarChunks> {
  try {
    // We want to perform a "keyword search" where *any* of the terms match (OR logic),
    // but websearch_to_tsquery defaults to AND. We can force OR behavior by injecting " or " between terms.
    const processedQuery = query
      .split(/[\s,]+/)
      .filter(Boolean)
      .join(" or ");
    const searchTerms = sql`websearch_to_tsquery('english', ${processedQuery})`;
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

    let queryBuilder = getDb()
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

    const results = await queryBuilder
      .where(and(...whereConditions))
      .orderBy(desc(rank))
      .limit(limit);

    return results;
  } catch (error) {
    console.error("Failed to find similar chunks by keyword", error);
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

export async function getUniqueResourceTitlesByUserIdPaginated({
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
  resources: Array<{ title: string; url: string | null }>;
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
      .selectDistinctOn([resource.title], {
        title: resource.title,
        url: resource.url,
      })
      .from(resource)
      .where(whereClause)
      .orderBy(resource.title, desc(resource.updatedAt))
      .limit(extendedLimit)
      .offset(offset);

    const hasMore = rows.length > limit;
    return {
      resources: hasMore ? rows.slice(0, limit) : rows,
      hasMore,
    };
  } catch (error) {
    console.error("Failed to get paginated resource titles by user id");
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
          and(inArray(resource.title, titles), eq(resource.userId, userId)),
        )
        .returning();
    } catch (error) {
      console.error("Failed to delete resources by titles");
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
  resources: Array<{ id: string; title: string; url: string | null }>;
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
      .orderBy(resource.title, desc(resource.updatedAt))
      .limit(extendedLimit)
      .offset(offset);

    const hasMore = rows.length > limit;
    return {
      resources: hasMore ? rows.slice(0, limit) : rows,
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
  resources: Array<{ id: string; title: string; url: string | null }>;
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
      .selectDistinctOn([resource.title], {
        id: resource.id,
        title: resource.title,
        url: resource.url,
      })
      .from(resource)
      .where(whereClause)
      .orderBy(resource.title, desc(resource.updatedAt))
      .limit(extendedLimit)
      .offset(offset);

    const hasMore = rows.length > limit;
    return {
      resources: hasMore ? rows.slice(0, limit) : rows,
      hasMore,
    };
  } catch (error) {
    console.error("Failed to get user resources not in project");
    throw error;
  }
}
