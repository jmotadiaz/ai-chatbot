import type { SimilarChunk, SimilarChunks } from "../queries";
import {
  findSimilarChunksByKeyword,
  findSimilarChunksBySemantic,
} from "../queries";
import { QueryType, RagChunk } from "../types";
import { providers } from "@/lib/infrastructure/ai/providers";
import { generateEmbeddings } from "@/lib/features/rag/retrieve/embeddings";
import { RerankResult } from "@/lib/features/foundation-model/types";

/**
 * After reranking, reorder chunks so that chunks from the same resource
 * appear in their original document order (by position), while preserving
 * the first-appearance order of resource groups from the reranker.
 */
const reorderByResourcePosition = (chunks: SimilarChunks): SimilarChunks => {
  const groups = new Map<string, SimilarChunk[]>();
  for (const chunk of chunks) {
    const key = chunk.resourceTitle;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(chunk);
  }
  return Array.from(groups.values())
    .map((group) => group.sort((a, b) => a.position - b.position))
    .flat();
};

const K_SEMANTIC_SEARCHES = 100;
const K_KEYWORD_SEARCHES = 20;
const SEMANTIC_SEARCH_SIMILARITY_THRESHOLD = 0.5;

interface RerankInput {
  query: string;
  chunks: SimilarChunks; // Acepta strings u objetos
  topN?: number;
  minScore?: number;
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
  topN = 10,
  minScore = 0.8,
}: RerankInput): Promise<SimilarChunks> {
  try {
    const results = await rerank({
      query: query,
      documents: chunks.map(({ content }) => content),
      topN,
    });

    return chunksByScore(results, chunks, minScore);
  } catch (error) {
    console.error("Error al reordenar documentos con Cohere:", error);
    return [];
  }
}

const chunksByScore = (
  results: RerankResult[],
  chunks: SimilarChunks,
  minScore: number,
) => {
  const rerankedChunks: SimilarChunk[] = [];
  for (const result of results) {
    const chunk = chunks[result.originalIndex];
    if (result.score >= minScore) {
      rerankedChunks.push(chunk);
    } else {
      break;
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
  ragMaxResources?: number;
  minRagResourcesScore?: number;
}

export const retrieveResourceChunks = async ({
  multiHopQueries,
  queryRewriting,
  previousResources,
  userId,
  projectId,
  ragMaxResources,
  minRagResourcesScore,
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
      limitByQuery: K_KEYWORD_SEARCHES,
      previousChunkIds: previousResources,
    }),
  ]);

  const chunks = getUniqueChunks([...vectorResults, ...keywordResults]);

  const finalResults = await rerankChunks({
    query: queryRewriting,
    chunks,
    topN: ragMaxResources,
    minScore: minRagResourcesScore,
  });

  const orderedResults = reorderByResourcePosition(finalResults);

  return orderedResults.map(({ id, content, resourceTitle, resourceUrl }) => {
    return {
      id,
      resourceTitle,
      resourceUrl,
      content,
    };
  });
};
