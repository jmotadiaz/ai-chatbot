## 1. Database Schema and Migration

- [] 1.1 Add `UserMemory` table to `lib/infrastructure/db/schema.ts` with `category` enum and `embedding` vector column
- [] 1.2 Define relations for `UserMemory` in `schema.ts`
- [] 1.3 Export `UserMemory` types (`UserMemory`, `InsertUserMemory`) in `schema.ts`
- [] 1.4 Generate database migration (`pnpm db:generate`)
- [] 1.5 Apply database migration (`pnpm db:migrate`)

## 2. Memory Data Access Layer

- [] 2.1 Create `lib/features/memory/types.ts` defining internal memory domain types
- [] 2.2 Create `lib/features/memory/queries.ts` with basic CRUD operations (insert, update, delete)
- [] 2.3 Add semantic search query for `personal` and `professional` facts in `queries.ts`
- [] 2.4 Add get query for all `preferences` facts in `queries.ts`

## 3. Memory Extraction

- [] 3.1 Create `lib/features/memory/extraction/prompts.ts` with system prompts for extraction
- [] 3.2 Create `lib/features/memory/extraction/dedup.ts` for semantic deduplication logic
- [] 3.3 Create `lib/features/memory/extraction/index.ts` to implement the main `extractMemoryFacts` function
- [] 3.4 Wire `extractMemoryFacts` to generate embeddings and insert/update DB via `queries.ts`

## 4. Memory Retrieval

- [] 4.1 Create `lib/features/memory/retrieval/format.ts` to format facts into system prompts
- [] 4.2 Create `lib/features/memory/retrieval/index.ts` to implement `getRelevantMemory`
- [] 4.3 Combine `preferences` and semantic `personal`/`professional` facts in retrieval logic

## 5. Chat Integration

- [] 5.1 In `lib/features/chat/conversation/factory.ts`, trigger `extractMemoryFacts` async inside `onFinish`
- [] 5.2 In `lib/features/chat/agents/factory.ts`, invoke `getRelevantMemory` around agent creation
- [] 5.3 Augment the system prompt passed to supported agents (excluding Context7) with the formatted memory context string
