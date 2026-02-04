import type { SimilarChunk, SimilarChunks } from "../queries";
import {
  findSimilarChunksByKeyword,
  findSimilarChunksBySemantic,
} from "../queries";
import { QueryType, RagChunk } from "../types";
import { providers } from "@/lib/infrastructure/ai/providers";
import { generateEmbeddings } from "@/lib/features/rag/retrieve/embeddings";
import { RerankResult } from "@/lib/features/foundation-model/types";

const K_SEMANTIC_SEARCHES = 100;
const K_KEYWORD_SEARCHES = 10;
const SEMANTIC_SEARCH_SIMILARITY_THRESHOLD = 0.5;

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
  for (const result of results) {
    const chunk = chunks[result.originalIndex];
    if (result.score >= 0.8) {
      rerankedChunks.push(chunk);
    } else if (result.score >= 0.4 && rerankedChunks.length < 4) {
      rerankedChunks.push(chunk);
    } else {
      return rerankedChunks;
    }
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
  if (multiHopQueries.length === 0) return [];

  // 1. Generate embeddings in batch
  const embeddings = await generateEmbeddings(
    multiHopQueries,
    "RETRIEVAL_QUERY",
  );

  // 2. Execute optimized batch searches in parallel
  const [vectorResults, keywordResults] = await Promise.all([
    findSimilarChunksBySemantic({
      embeddings,
      userId,
      projectId,
      limitByQuery: K_SEMANTIC_SEARCHES,
      similarityThreshold: SEMANTIC_SEARCH_SIMILARITY_THRESHOLD,
      previousChunkIds: previousResources,
    }),
    findSimilarChunksByKeyword({
      queries: multiHopQueries,
      userId,
      projectId,
      limit: K_KEYWORD_SEARCHES * multiHopQueries.length,
      previousChunkIds: previousResources,
    }),
  ]);

  const chunks = getUniqueChunks([...vectorResults, ...keywordResults]);

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
