import type { SimilarChunk, SimilarChunks } from "../types";
import { QueryType } from "../types";
import { RerankResult } from "@/lib/features/foundation-model/types";

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
