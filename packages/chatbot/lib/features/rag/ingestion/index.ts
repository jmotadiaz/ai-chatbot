/**
 * Public surface of RAG ingestion.
 *
 * The functions are plain entry points, not factories: ingestion owns its
 * concrete inference (`./embeddings` → `inferenceKit.embed`) and takes no AI
 * dependency. Tests drive this module and substitute the Model Gateway over HTTP
 * (`tests/unit/rag/ingestion.test.ts`), never a feature-level port.
 *
 * `EmbeddingRateLimiter` stays out of this surface on purpose: its window and
 * clock options describe the production budget a consumer may vary, and the
 * feature reaches it through the `embeddingRateLimiter` singleton only.
 */
export { saveUrlResource, saveMarkdownResource } from "./ingest";

export type { UrlResource } from "./fetch";
