import type { SimilarChunk, SimilarChunks } from "../types";
import { QueryType } from "../types";
import type { RerankResult } from "@/lib/infrastructure/ai/types";

/**
 * After reranking, reorder chunks so that chunks from the same resource
 * appear in their original document order (by position), while preserving
 * the first-appearance order of resource groups from the reranker.
 */
export const reorderByResourcePosition = (
  chunks: SimilarChunks,
): SimilarChunks => {
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

export const getUniqueChunks = (chunks: SimilarChunks) => {
  const map = new Map<string, SimilarChunk>();
  chunks.forEach((doc) => {
    if (!map.has(doc.id)) map.set(doc.id, doc);
  });
  return Array.from(map.values());
};

/**
 * Selects chunks in rerank order: `results[i].originalIndex` is the position of
 * the document in the `documents` array sent to the Gateway, so the association
 * is purely positional. Selection stops at the first result below `minScore`
 * (results are expected in descending score order).
 *
 * The ranking is trusted: an index outside `chunks` is not validated here, so
 * it surfaces as a `TypeError` while the selected chunk is read for document
 * ordering (`reorderByResourcePosition`), which runs outside the `try`/`catch`
 * that turns a rerank failure into an empty result. Preserved behaviour; a
 * bounds guard would belong with the rerank contract, not here.
 */
export const chunksByScore = (
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
