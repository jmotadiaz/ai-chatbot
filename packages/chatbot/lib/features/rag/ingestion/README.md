# RAG ingestion

Fetches or receives a document, chunks it (parent chunks + child
`embeddableContent`), embeds every child over the Model Gateway and persists the
resource, its chunks and their embeddings in one transaction.

## Public surface

`lib/features/rag/ingestion/index.ts`:

| Export | Responsibility |
| :-- | :-- |
| `saveUrlResource({ urlResource, userId, projectId? })` | Fetch + convert a URL, chunk it, embed it, persist it. `{ success: false }` when the page cannot be fetched or produces no chunks. |
| `saveMarkdownResource({ title, content, userId, projectId? })` | Same pipeline for markdown already in hand (`url: null`). |
| `UrlResource` | The URL input type (`url`, optional `container`/`excludeSelectors`). |

Internal helpers (not exported from the feature): `chunking.ts` (pure markdown
chunking, independently tested), `fetch.ts` (JSDOM + turndown), `embeddings.ts`
(batching + chunk↔vector remap), `rate-limiter.ts` (sliding-window limiter),
`ingest.ts` (the two use cases).

## Inference

Ingestion owns its concrete inference: `embeddings.ts` calls
`inferenceKit.embed(inputs, { taskType: "RETRIEVAL_DOCUMENT" })`, which sends
`POST /v1/embeddings` with `model: "embedding-default"`, `dimensions: 768` and
the shared batching (`99` inputs per request) and rate limiting
(`embeddingRateLimiter`: 2000 inputs / 350k estimated tokens per minute).

There is no `RagIngestionAiPort`, no adapter and no factory parameter: tests
substitute the Model Gateway at its **HTTP seam** (ADR 0013), not the feature's
inference. The embedding call runs *before* the transaction, so a failing or
malformed Gateway reply leaves no resource, chunk or embedding behind.

## Tests and the guarantees they own

`tests/unit/rag/` (PGlite in memory + MSW; no PostgreSQL container, no gateway
listening on `:4001`, no real provider):

| Test | Guarantees |
| :-- | :-- |
| `ingestion.test.ts` | URL fetch → chunk → embed → persist end to end, resource title/URL, user vs project ownership (`projectResource` link), chunk `resourceId` fix-up, one embedding row per child chunk, the recorded contract (`embedding-default`, 768, `RETRIEVAL_DOCUMENT`, batched inputs), chunk↔vector association survived as a partition of the inputs by chunk, batching at 99 inputs, unreachable page / empty content write nothing and issue no request, failed and malformed embedding replies propagate and persist nothing. |
| `rate-limiter.test.ts` | Sliding-window budget on request count and tokens, with an explicit clock instead of sleeping for the production window. |
| `chunking.test.ts` | Unchanged pure chunking rules. |

Vectors are prepared by the test (`preparedVector(index)`): a one-hot position
marker, never a function of the input text. It does not imitate a model; it makes
the identity of each input observable in the database now that no port echoes
`chunkId` back.

### Replacement map (removed double → where its guarantee lives)

| Removed | Guarantee now verified in |
| :-- | :-- |
| `RagIngestionAiPort` (`ingestion/ports.ts`) | Deleted. The feature calls `generateEmbeddings` → `inferenceKit.embed` directly; the contract (`model`, `dimensions`, `task_type`) is asserted from the recorded `/v1/embeddings` request. |
| `makeIngestUrlResource(ai)` / `makeIngestMarkdownResource(ai)` (and the `aiAdapter` in `index.ts`) | Collapsed into `saveUrlResource` / `saveMarkdownResource` in `ingest.ts`; the public names in `index.ts` are unchanged for `actions.ts`. |
| Fake `generateEmbeddings` returning `Array(768).fill(0.1)` | `ingestion.test.ts`: the stored vectors equal the prepared vectors the MSW scenario returned, one per input. |
| Fake AI echoing `chunkId` (the old association oracle) | `ingestion.test.ts`: grouping the stored vectors by `chunkId` reproduces a contiguous partition of the inputs, in chunk position order. |
| Old `tests/integration/rag/ingestion.test.ts` | Moved to `tests/unit/rag/ingestion.test.ts` (same scenarios, now PGlite + MSW with `onUnhandledRequest: "error"`). |
