import { makeRetrieveResourceChunks } from "./factory";
import { generateEmbeddings } from "./embeddings";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";
export type { RetrieveResourcesInput } from "./search";

const aiAdapter = {
  generateEmbeddings,
  rerank: (params: { query: string; documents: string[]; topN?: number }) =>
    inferenceKit.rerank("rerank", params),
};

// Singleton export to be used by the app / tools
export const retrieveResourceChunks = makeRetrieveResourceChunks(
  aiAdapter,
);
