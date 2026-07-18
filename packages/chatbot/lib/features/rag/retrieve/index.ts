import { makeRetrieveResourceChunks } from "./factory";
import { generateEmbeddings } from "./embeddings";
import { providers } from "@/lib/infrastructure/ai/providers";
export type { RetrieveResourcesInput } from "./search";

const aiAdapter = {
  generateEmbeddings,
  rerank: async (params: {
    query: string;
    documents: string[];
    topN?: number;
  }) => {
    const reranker = providers.rerank();
    return reranker(params);
  },
};

// Singleton export to be used by the app / tools
export const retrieveResourceChunks = makeRetrieveResourceChunks(
  aiAdapter,
);
