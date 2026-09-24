/**
 * Rerank is not a language-model endpoint either, so it gets its own kind
 * union instead of joining `ProviderKind` (see `catalog.ts`). Today there is
 * only one: Cohere's reranking endpoint.
 */
export type RerankProviderKind = "cohere";

export interface RerankModelCatalogEntry {
  id: string;
  provider: { kind: RerankProviderKind; modelId: string };
}

export const RERANK_MODELS = [
  {
    id: "Cohere Rerank v4 Pro",
    // Not one of `@ai-sdk/cohere`'s typed `CohereRerankingModelId` literals
    // (only compiles there via its `(string & {})` escape hatch) — this
    // catalog does not force that SDK's narrower union onto its own data.
    provider: { kind: "cohere", modelId: "rerank-v4.0-pro" },
  },
] as const satisfies readonly RerankModelCatalogEntry[];

export type RerankModelId = (typeof RERANK_MODELS)[number]["id"];

/** Model Roles resolving into `RERANK_MODELS`. Merged into `MODEL_ROLES` (see `roles.ts`). */
export const RERANK_ROLES = {
  rerank: "Cohere Rerank v4 Pro",
} as const satisfies Record<string, RerankModelId>;

export type RerankRole = keyof typeof RERANK_ROLES;
