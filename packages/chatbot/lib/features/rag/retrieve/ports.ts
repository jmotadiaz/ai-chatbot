import { QueryType } from "../types";
import type { RerankResult } from "@/lib/infrastructure/ai/types";

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
