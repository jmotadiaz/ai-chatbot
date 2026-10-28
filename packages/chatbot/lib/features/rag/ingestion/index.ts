/**
 * Public surface of RAG ingestion.
 *
 * The functions are plain entry points, not factories: ingestion owns its
 * concrete inference (`./embeddings` → `inferenceKit.embed`) and takes no AI
 * dependency. Tests drive this module and substitute the Model Gateway over HTTP
 * (`tests/unit/rag/ingestion.test.ts`), never a feature-level port.
 */
export { saveUrlResource, saveMarkdownResource } from "./ingest";

export type { UrlResource } from "./fetch";
