import { RagChunk, SimilarChunks  } from "../types";
import { RagRetrieveDbPort, RagRetrieveAiPort } from "./ports";
import {
  RetrieveResourcesInput,
  reorderByResourcePosition,
  getUniqueChunks,
  chunksByScore,
} from "./search";

const K_SEMANTIC_SEARCHES = 100;
const K_KEYWORD_SEARCHES = 20;
const SEMANTIC_SEARCH_SIMILARITY_THRESHOLD = 0.5;

export const makeRetrieveResourceChunks = (
  db: RagRetrieveDbPort,
  ai: RagRetrieveAiPort,
) => {
  return async ({
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
    const embeddings = await ai.generateEmbeddings(
      multiHopQueries,
      "RETRIEVAL_QUERY",
    );

    // 2. Execute optimized batch searches in parallel
    const [vectorResults, keywordResults] = await Promise.all([
      db.findSimilarChunksBySemantic({
        embeddings,
        userId,
        projectId,
        limitByQuery: K_SEMANTIC_SEARCHES,
        similarityThreshold: SEMANTIC_SEARCH_SIMILARITY_THRESHOLD,
        previousChunkIds: previousResources,
      }),
      db.findSimilarChunksByKeyword({
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
      const results = await ai.rerank({
        query: queryRewriting,
        documents: chunks.map(({ content }) => content),
        topN: ragMaxResources,
      });

      finalResults = chunksByScore(results, chunks, minRagResourcesScore);
    } catch (error) {
      console.error("Error al reordenar documentos:", error);
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
};
