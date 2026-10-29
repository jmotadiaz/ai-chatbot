import { RagChunk, SimilarChunks } from "../types";
import {
  findSimilarChunksBySemantic,
  findSimilarChunksByKeyword,
} from "../queries";
import { generateEmbeddings } from "./embeddings";
import {
  RetrieveResourcesInput,
  reorderByResourcePosition,
  getUniqueChunks,
  chunksByScore,
} from "./search";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";

const K_SEMANTIC_SEARCHES = 100;
const K_KEYWORD_SEARCHES = 20;
const SEMANTIC_SEARCH_SIMILARITY_THRESHOLD = 0.5;

/**
 * Retrieval pipeline: query embeddings (`embedding-default`) → semantic +
 * keyword search → dedupe → rerank (`rerank-default`) → score threshold →
 * document order.
 *
 * The feature owns its inference: it calls the shared kit directly, so tests
 * substitute the Model Gateway at its HTTP seam (ADR 0013) instead of injecting
 * an AI port.
 */
export const retrieveResourceChunks = async ({
  multiHopQueries,
  queryRewriting,
  previousResources,
  userId,
  projectId,
  ragMaxResources,
  minRagResourcesScore = 0.8,
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

  // 3. Rerank chunks
  let finalResults: SimilarChunks = [];
  try {
    const results = await inferenceKit.rerank({
      query: queryRewriting,
      documents: chunks.map(({ content }) => content),
      topN: ragMaxResources,
    });

    finalResults = chunksByScore(results, chunks, minRagResourcesScore);
  } catch (error) {
    console.error("Error reranking documents:", error);
    finalResults = [];
  }

  // 4. Reorder by original position
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
