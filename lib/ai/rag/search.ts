import { generateEmbedding, QueryType } from "@/lib/ai/rag/embeddings";
import type { SimilarChunk, SimilarChunks } from "@/lib/db/queries";
import { findSimilarChunks } from "@/lib/db/queries";
import { providers } from "@/lib/features/models/providers";

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
