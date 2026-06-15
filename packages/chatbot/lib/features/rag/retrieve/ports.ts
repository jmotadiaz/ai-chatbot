import { QueryType } from "../types";
import { RerankResult } from "@/lib/features/foundation-model/types";

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
