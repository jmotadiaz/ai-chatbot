## 1. Database Schema and Migration

- [x] 1.1 Add `UserMemory` table to `lib/infrastructure/db/schema.ts` with `category` enum and `embedding` vector column
- [x] 1.2 Define relations for `UserMemory` in `schema.ts`
- [x] 1.3 Export `UserMemory` types (`UserMemory`, `InsertUserMemory`) in `schema.ts`
- [x] 1.4 Generate database migration (`pnpm db:generate`)
- [x] 1.5 Apply database migration (`pnpm db:migrate`)

## 2. Memory Data Access Layer

- [x] 2.1 Create `lib/features/memory/types.ts` defining internal memory domain types
- [x] 2.2 Create `lib/features/memory/queries.ts` with basic CRUD operations (insert, update, delete)
- [x] 2.3 Add semantic search query for `personal` and `professional` facts in `queries.ts`
- [x] 2.4 Add get query for all `preferences` facts in `queries.ts`

## 3. Memory Extraction

- [x] 3.1 Create `lib/features/memory/extraction/prompts.ts` with system prompts for extraction
- [x] 3.2 Create `lib/features/memory/extraction/dedup.ts` for semantic deduplication logic
- [x] 3.3 Create `lib/features/memory/extraction/index.ts` to implement the main `extractMemoryFacts` function
- [x] 3.4 Wire `extractMemoryFacts` to generate embeddings and insert/update DB via `queries.ts`

## 4. Memory Retrieval

- [x] 4.1 Create `lib/features/memory/retrieval/format.ts` to format facts into system prompts
- [x] 4.2 Create `lib/features/memory/retrieval/index.ts` to implement `getRelevantMemory`
- [x] 4.3 Combine `preferences` and semantic `personal`/`professional` facts in retrieval logic
- [x] 4.4 Create `lib/features/memory/retrieval/prompts.ts` with multi-hop query decomposition prompt (memory-oriented, not RAG-style)
- [x] 4.5 Create `lib/features/memory/retrieval/query-decomposition.ts` implementing `decomposeForMemorySearch` using `generateObject` with a fast model (`Gemini 3.1 Flash Lite`) and a Zod schema for 1–3 search queries
- [x] 4.6 Refactor `getContextualFacts` in `retrieval/index.ts` to call `decomposeForMemorySearch`, then use `embedMany` (instead of single `embed`) on the generated queries, and perform cosine-search for each embedding with deduplication of results

## 5. Chat Integration

- [x] 5.1 In `lib/features/chat/conversation/factory.ts`, trigger `extractMemoryFacts` async inside `onFinish`
- [x] 5.2 In `lib/features/chat/agents/factory.ts`, invoke `getRelevantMemory` around agent creation
- [x] 5.3 Augment the system prompt passed to supported agents (excluding Context7) with the formatted memory context string
