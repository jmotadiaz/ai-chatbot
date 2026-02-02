import type { SimilarChunk, SimilarChunks } from "../queries";
import { findSimilarChunks, findSimilarChunksByKeyword } from "../queries";
import { QueryType, RagChunk } from "../types";
import { providers } from "@/lib/infrastructure/ai/providers";
import { generateEmbedding } from "@/lib/features/rag/retrieve/embeddings";
import { RerankResult } from "@/lib/features/foundation-model/types";

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

const K_VECTOR_SEARCHES = 100;
const K_KEYWORD_SEARCHES = 10;
const VECTOR_SEARCH_SIMILARITY_THRESHOLD = 0.5;

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
}: VectorSearchInput): Promise<SimilarChunks> {
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

    return similarChunks;
  } catch (error) {
    console.error("Error in retrieve function:", error);
    return [];
  }
}

const keywordSearch = async ({
  query,
  userId,
  projectId,
  limit = 10,
  previousChunkIds = [],
}: VectorSearchInput): Promise<SimilarChunks> => {
  try {
    const similarChunks = await findSimilarChunksByKeyword({
      query,
      userId,
      projectId,
      limit,
      previousChunkIds,
    });

    return similarChunks;
  } catch (error) {
    console.error("Error in retrieve function:", error);
    return [];
  }
};

interface RerankInput {
  query: string;
  chunks: SimilarChunks; // Acepta strings u objetos
}

const rerank = providers.rerank();

const getUniqueChunks = (chunks: SimilarChunks) => {
  const map = new Map<string, SimilarChunk>();
  chunks.forEach((doc) => {
    if (!map.has(doc.id)) map.set(doc.id, doc);
  });
  return Array.from(map.values());
};

/**
 * Reordena una lista de documentos basada en su relevancia semántica con una consulta.
 */
export async function rerankChunks({
  query,
  chunks,
}: RerankInput): Promise<SimilarChunks> {
  try {
    // 2. Llamada a la API
    const results = await rerank({
      query: query,
      documents: chunks.map(({ content }) => content),
      topN: 20,
    });

    return chunksByScore(results, chunks);
  } catch (error) {
    console.error("Error al reordenar documentos con Cohere:", error);
    return [];
  }
}

const chunksByScore = (results: RerankResult[], chunks: SimilarChunks) => {
  const rerankedChunks: SimilarChunk[] = [];
  let count = 0;
  for (const result of results) {
    const chunk = chunks[result.originalIndex];
    if (result.score >= 0.6) {
      rerankedChunks.push(chunk);
    } else if (result.score >= 0.35 && rerankedChunks.length < 6) {
      count++;
      rerankedChunks.push(chunk);
    }

    if (count >= 4) break;
  }

  return rerankedChunks;
};

export interface RetrieveResourcesInput {
  multiHopQueries: string[];
  queryRewriting: string;
  previousResources: string[];
  queryType?: QueryType;
  userId: string;
  projectId?: string;
  limit?: number;
}

export const retrieveResourceChunks = async ({
  multiHopQueries,
  queryRewriting,
  previousResources,
  userId,
  projectId,
}: RetrieveResourcesInput): Promise<RagChunk[]> => {
  const chunks = getUniqueChunks(
    (
      await Promise.all(
        multiHopQueries.map(async (query) => {
          const [vectorResult, keywordResult] = await Promise.all([
            vectorSearch({
              query,
              userId,
              projectId,
              queryType: "RETRIEVAL_QUERY",
              limit: K_VECTOR_SEARCHES,
              similarityThreshold: VECTOR_SEARCH_SIMILARITY_THRESHOLD,
              previousChunkIds: previousResources,
            }),
            keywordSearch({
              query,
              userId,
              projectId,
              limit: K_KEYWORD_SEARCHES,
              previousChunkIds: previousResources,
            }),
          ]);

          return [...vectorResult, ...keywordResult];
        }),
      )
    ).flat(),
  );

  const finalResults = await rerankChunks({
    query: queryRewriting,
    chunks,
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
