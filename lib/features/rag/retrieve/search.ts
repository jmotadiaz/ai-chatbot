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
  limit = 10,
  similarityThreshold = 0.6,
  previousChunkIds = [],
}: VectorSearchInput): Promise<VectorSearchResult> {
  try {
    const userQueryEmbedded = await generateEmbedding(query, queryType);
    const similarChunks = await findSimilarChunks({
      embedding: userQueryEmbedded,
      userId,
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
  multiHopQueries: string[];
  queryRewriting: string;
  previousResources: string[];
  queryType?: QueryType;
  userId: string;
  limit?: number;
}

const K_VECTOR_SEARCHES = 10;
const VECTOR_SEARCH_SIMILARITY_THRESHOLD = 0.5;

export const retrieveResources = async ({
  multiHopQueries,
  queryRewriting,
  previousResources,
  queryType,
  userId,
  limit = 6,
}: RetrieveResourcesInput): Promise<RagChunk[]> => {
  const results = await Promise.all(
    multiHopQueries.map((query) =>
      vectorSearch({
        query,
        queryType,
        userId,
        limit: K_VECTOR_SEARCHES,
        similarityThreshold: VECTOR_SEARCH_SIMILARITY_THRESHOLD,
        previousChunkIds: previousResources,
      })
    )
  );

  const vectorSearchResults: SimilarChunks = [];

  for (const result of results) {
    if (result.success && result.similarChunks) {
      vectorSearchResults.push(...result.similarChunks);
    } else if (!result.success) {
      console.warn("One of the RAG queries failed:", result.error);
    }
  }

  if (vectorSearchResults.length === 0) {
    console.error("No resources or similar chunks found for any query");
    return [];
  }

  const finalResults = await rerankResources({
    query: queryRewriting,
    resources: vectorSearchResults,
    topN: limit,
  });

  return finalResults.map(({ id, content, resourceTitle, resourceUrl }) => {
    return {
      id,
      resourceTitle,
      resourceUrl,
      content,
    };
  });
};
