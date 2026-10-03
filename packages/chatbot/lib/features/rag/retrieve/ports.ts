import type { RerankResult } from "inference";
import { QueryType } from "../types";

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
