import type { SimilarChunk, SimilarChunks } from "../queries";
import { findSimilarChunks } from "../queries";
import { QueryType, RagChunk } from "../types";
import { providers } from "@/lib/infrastructure/ai/providers";
import { generateEmbedding } from "@/lib/features/rag/retrieve/embeddings";

export interface VectorSearchResult {
  success: boolean;
  similarChunks?: SimilarChunks;
  error?: string;
}

export interface VectorSearchInput {
  query: string;
  queryType?: QueryType;
  userId: string;
  projectId?: string;
  limit?: number;
  similarityThreshold?: number; // 0-100
  previousChunkIds?: string[];
}

/**
 * Retrieves relevant context from RAG database for a given query
 */
export async function vectorSearch({
  query,
  queryType = "RETRIEVAL_QUERY",
  userId,
  projectId,
  limit = 10,
  similarityThreshold = 0.6,
  previousChunkIds = [],
}: VectorSearchInput): Promise<VectorSearchResult> {
  try {
    const userQueryEmbedded = await generateEmbedding(query, queryType);
    const similarChunks = await findSimilarChunks({
      embedding: userQueryEmbedded,
      userId,
      projectId,
      limit,
      similarityThreshold,
      previousChunkIds,
    });

    if (similarChunks.length === 0) {
      return {
        success: false,
        error: "No relevant context found in knowledge base",
      };
    }

    return {
      success: true,
      similarChunks,
    };
  } catch (error) {
    console.error("Error in retrieve function:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error in retrieve function",
    };
  }
}

interface RerankInput {
  query: string;
  resources: SimilarChunks; // Acepta strings u objetos
  topN: number;
}

const rerank = providers.rerank();

const getUniqueResources = (resources: SimilarChunks) => {
  const map = new Map<string, SimilarChunk>();
  resources.forEach((doc) => {
    map.set(doc.content, doc);
  });
  return Array.from(map.values());
};

/**
 * Reordena una lista de documentos basada en su relevancia semántica con una consulta.
 */
export async function rerankResources({
  query,
  resources,
  topN,
}: RerankInput): Promise<SimilarChunks> {
  const uniqueResources = getUniqueResources(resources);

  if (uniqueResources.length <= topN) {
    return uniqueResources;
  }

  try {
    // 2. Llamada a la API
    const results = await rerank({
      query: query,
      documents: uniqueResources.map(({ content }) => content),
      topN: topN,
    });

    return results.map(({ index }) => uniqueResources[index]);
  } catch (error) {
    console.error("Error al reordenar documentos con Cohere:", error);
    return [];
  }
}

export interface RetrieveResourcesInput {
  queries: string[];
  previousResources: string[];
  queryType?: QueryType;
  userId: string;
  projectId?: string;
  limit?: number;
}

const K_VECTOR_SEARCHES = 50;
const VECTOR_SEARCH_SIMILARITY_THRESHOLD = 0.6;

export const retrieveResources = async ({
  queries,
  previousResources,
  queryType,
  userId,
  projectId,
  limit = 6,
}: RetrieveResourcesInput): Promise<RagChunk[]> => {
  const results = await Promise.all(
    queries.map(async (query) => {
      // 1. Vector Search
      const vectorRes = await vectorSearch({
        query,
        queryType,
        userId,
        projectId,
        limit: K_VECTOR_SEARCHES,
        similarityThreshold: VECTOR_SEARCH_SIMILARITY_THRESHOLD,
        previousChunkIds: previousResources,
      });

      if (!vectorRes.success || !vectorRes.similarChunks) {
        console.warn(
          `Vector search failed for query: "${query}"`,
          vectorRes.error,
        );
        return [];
      }

      // 2. Rerank
      // Request 'limit' to have enough candidates for deduplication fallback
      const reranked = await rerankResources({
        query,
        resources: vectorRes.similarChunks,
        topN: limit,
      });

      return reranked;
    }),
  );

  const uniqueResultsMap = new Map<string, SimilarChunk>();

  // Weighted Priority Strategy
  // 1 query: 100%
  // 2 queries: 70% / 30%
  // 3 queries: 50% / 40% / 10%
  let weights: number[];
  if (queries.length === 1) {
    weights = [1.0];
  } else if (queries.length === 2) {
    weights = [0.7, 0.3];
  } else if (queries.length === 3) {
    weights = [0.5, 0.4, 0.1];
  } else {
    weights = new Array(queries.length).fill(1 / queries.length);
  }

  for (let i = 0; i < queries.length; i++) {
    const queryResults = results[i];
    const weight = weights[i];
    const queryQuota = Math.floor(limit * weight);

    // Slice candidates based on quota
    const candidates = queryResults.slice(0, queryQuota);

    for (const chunk of candidates) {
      if (!uniqueResultsMap.has(chunk.id)) {
        uniqueResultsMap.set(chunk.id, chunk);
      }
    }
  }

  return Array.from(uniqueResultsMap.values()).map(
    ({ id, content, resourceTitle, resourceUrl }) => ({
      id,
      resourceTitle,
      resourceUrl,
      content,
    }),
  );
};
