import { SimilarChunks, QueryType  } from "../types";
import { RerankResult } from "@/lib/features/foundation-model/types";

export interface RagRetrieveDbPort {
  findSimilarChunksBySemantic(params: {
    embeddings: number[][];
    userId: string;
    projectId?: string;
    limitByQuery?: number;
    similarityThreshold?: number;
    previousChunkIds?: string[];
  }): Promise<SimilarChunks>;

  findSimilarChunksByKeyword(params: {
    queries: string[];
    userId: string;
    projectId?: string;
    limitByQuery?: number;
    previousChunkIds?: string[];
  }): Promise<SimilarChunks>;
}

export interface RagRetrieveAiPort {
  generateEmbeddings(
    values: string[],
    queryType: QueryType,
  ): Promise<number[][]>;
  rerank(params: {
    query: string;
    documents: string[];
    topN?: number;
  }): Promise<RerankResult[]>;
}
