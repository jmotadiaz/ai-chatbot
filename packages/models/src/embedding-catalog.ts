/**
 * Embedding is not a language-model endpoint, so it gets its own kind union
 * instead of joining `ProviderKind` (see `catalog.ts`). Today there is only
 * one: Google Generative AI's embedding endpoint.
 */
export type EmbeddingProviderKind = "google";

/**
 * Google's embedding task hint, applied per call. Mirrors
 * `GoogleGenerativeAIEmbeddingProviderOptions["taskType"]` from `@ai-sdk/google`
 * as plain data (this package stays dependency-free and isomorphic, so it
 * cannot import the AI SDK's type) — kept in sync by hand.
 */
export type EmbeddingTaskType =
  | "SEMANTIC_SIMILARITY"
  | "CLASSIFICATION"
  | "CLUSTERING"
  | "RETRIEVAL_DOCUMENT"
  | "RETRIEVAL_QUERY"
  | "QUESTION_ANSWERING"
  | "FACT_VERIFICATION"
  | "CODE_RETRIEVAL_QUERY";

export interface EmbeddingModelCatalogEntry {
  id: string;
  provider: { kind: EmbeddingProviderKind; modelId: string };
  /**
   * Output vector size requested on every call. A deliberate truncation of
   * the model's native/default dimensionality (768 for `gemini-embedding-001`),
   * not the model's own default — every RAG/memory call site hardcoded this
   * value before the `embed` kit operation existed; changing it changes the
   * stored embeddings' shape.
   */
  outputDimensionality: number;
  /** taskTypes this entry accepts; `embed()` validates its caller's taskType against this list. */
  taskTypes: readonly EmbeddingTaskType[];
}

export const EMBEDDING_MODELS = [
  {
    id: "Gemini Embedding 001",
    provider: { kind: "google", modelId: "gemini-embedding-001" },
    outputDimensionality: 768,
    taskTypes: [
      "SEMANTIC_SIMILARITY",
      "CLASSIFICATION",
      "CLUSTERING",
      "RETRIEVAL_DOCUMENT",
      "RETRIEVAL_QUERY",
      "QUESTION_ANSWERING",
      "FACT_VERIFICATION",
      "CODE_RETRIEVAL_QUERY",
    ],
  },
] as const satisfies readonly EmbeddingModelCatalogEntry[];

export type EmbeddingModelId = (typeof EMBEDDING_MODELS)[number]["id"];

/** Model Roles resolving into `EMBEDDING_MODELS`. Merged into `MODEL_ROLES` (see `roles.ts`). */
export const EMBEDDING_ROLES = {
  embedding: "Gemini Embedding 001",
} as const satisfies Record<string, EmbeddingModelId>;

export type EmbeddingRole = keyof typeof EMBEDDING_ROLES;
