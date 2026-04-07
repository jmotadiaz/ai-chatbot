## Context

The chatbot application currently has a mature RAG pipeline (`lib/features/rag/`) for external knowledge retrieval. It uses:

- **Ingestion**: URL/Markdown → Chunking → Embedding (768-dim via `gemini-embedding-001`) → PostgreSQL with pgvector
- **Retrieval**: Multi-hop semantic search + keyword search (tsvector) → Reranking (Cohere `rerank-v4.0-pro`) → Context injection via AI Tool
- **Agents**: `ToolLoopAgent` pattern with `prepareStep` for multi-step orchestration (`lib/features/chat/agents/`)
- **Chat lifecycle**: `conversation/factory.ts` handles message persistence in `onFinish` callback

The user memory system introduces a new dimension: knowledge the chatbot _learns_ from conversations and persists for future use. While it shares infrastructure (pgvector, embedding model), it has a fundamentally different lifecycle from RAG.

### Current integration points

- `lib/features/chat/conversation/factory.ts` → `onFinish` callback (line ~167): where memory extraction will be triggered
- `lib/features/chat/agents/factory.ts` → `createAgent` function: where memory context will be injected into system prompts
- `lib/infrastructure/db/schema.ts`: centralized schema definitions
- `lib/infrastructure/ai/providers.ts`: `providers.embedding()` → `gemini-embedding-001` (768-dim), reusable for memory embeddings

## Goals / Non-Goals

**Goals:**

- Extract user facts from conversations automatically (passive extraction)
- Store facts with embeddings for semantic retrieval
- Inject relevant facts into system prompts: preferences always, personal/professional via semantic filtering
- Deduplicate facts using embedding similarity to avoid redundancy
- Design the extraction API to accept an array of messages (flexible), while the orchestration layer passes only the last user/assistant pair (pragmatic)
- Zero impact on user-perceived response latency (extraction runs post-response)

**Non-Goals:**

- Active extraction (user explicitly tells the bot to remember something) — future enhancement
- UI for managing memory facts — future enhancement
- Cross-user memory or shared organizational memory
- Memory decay/expiration policies — future enhancement
- Using memory facts as a RAG tool (memory is always pre-injected, not tool-invoked)

## Decisions

### 1. New `lib/features/memory/` module (not extending RAG or chat)

**Decision**: Create a standalone feature module.

**Rationale**: Memory has a distinct lifecycle from RAG (emergent vs uploaded, pre-injected vs tool-invoked). Placing it inside `rag/` would violate SRP. Placing it inside `chat/` would mix orchestration with domain logic. The existing pattern (each feature is self-contained, consumed by chat) supports this.

**Alternatives considered**:

- Extend `rag/` — Rejected: different domain semantics, different ingestion pipeline, different retrieval timing
- Extend `chat/` — Rejected: chat is orchestration layer, not domain logic

### 2. Dedicated `UserMemory` table with embedded vectors

**Decision**: New table with `category` enum, `content` (natural language text), and `embedding` (768-dim vector).

```
UserMemory
├── id: uuid (PK)
├── userId: uuid (FK → User)
├── category: enum (personal | professional | preferences)
├── content: text  ("The user lives in Madrid, Spain")
├── embedding: vector(768)
├── source: enum (extracted | explicit)
├── createdAt: timestamp
├── updatedAt: timestamp
├── INDEXES:
│   ├── HNSW on embedding (vector_cosine_ops)
│   └── btree on (userId, category)
```

**Rationale**:

- Natural language `content` is more flexible than key-value pairs and easier for the LLM to both produce (extraction) and consume (system prompt injection).
- `category` enables the hybrid retrieval strategy (always-include preferences, semantic-filter the rest).
- Embeddings use the same 768-dim model (`gemini-embedding-001`) as the existing RAG system.
- No `key` column — deduplication uses embedding cosine similarity (>0.85 threshold → update instead of insert).

**Alternatives considered**:

- Key-value strict schema — Rejected: requires the LLM to produce normalized keys, rigid, loses nuance
- Pure text without embeddings — Rejected: needed for contextual filtering (not all facts are relevant to every conversation)
- Reuse the existing `Resource/Chunk/Embedding` tables — Rejected: overengineered for atomic facts, semantic mismatch with document chunks

### 3. Hybrid retrieval: preferences always-on + semantic search for the rest

**Decision**: On every request:

1. Load ALL facts where `category = 'preferences'` (always relevant — tone, language, response style)
2. Embed the user's current message, then cosine-search against facts where `category IN ('personal', 'professional')`, returning top-N above a similarity threshold

**Rationale**: Preference facts (tone, language, response length) are universally relevant regardless of topic. Personal/professional facts are contextual — "lives in Madrid" is relevant for travel questions but not for coding questions. Semantic filtering avoids prompt pollution.

**Alternatives considered**:

- Always inject all facts — Rejected by user: wastes tokens and introduces noise
- LLM-based filtering — Rejected: adds latency (~200-500ms per request) and cost
- Tool-based retrieval — Rejected: memory should be pre-injected context, not something the LLM decides to look up

### 4. Fire-and-forget extraction in onFinish

**Decision**: Memory extraction runs as an async, non-blocking call in the `onFinish` callback of `conversation/factory.ts`. Failures are logged but do not affect the chat response.

**Rationale**: Zero latency impact. The user's response is already streamed. Extraction is best-effort — a failed extraction just means no new facts this turn, not a broken chat.

**Implementation**:

```typescript
extractMemoryFacts({ messages: [userMessage, assistantMessage], userId }).catch(
  (err) => console.error("Memory extraction failed:", err),
);
```

### 5. LLM-based extraction with structured output

**Decision**: Use `generateObject` (from AI SDK) with a small/fast model to analyze messages and produce structured facts. The prompt instructs the LLM to extract facts in three categories, outputting an array of `{ category, content }` objects.

**Rationale**: Structured output (Zod schema) ensures predictable format. A small model (e.g., `gemini-3.1-flash-lite`) keeps cost and latency minimal since this runs async.

### 6. Deduplication via embedding similarity

**Decision**: Before inserting a new fact, generate its embedding and search for existing facts with cosine similarity > 0.85. If found, update the existing fact's content and embedding. If not found, insert.

**Rationale**: Natural language facts don't have stable keys ("Lives in Madrid" vs "The user is located in Madrid, Spain" are the same fact). Semantic similarity is the right tool for dedup. The 0.85 threshold is conservative enough to catch paraphrases while avoiding false merges.

### 7. Memory context injection into system prompts

**Decision**: In `agents/factory.ts`, before creating any supported agent (excluding Context7), call `getRelevantMemory(userId, currentMessage)` and append the result to the system prompt as a clearly delineated section. Context7 is excluded as its SDK does not currently support custom system prompts.

**Format**:

```
## What you know about the user
- Lives in Madrid, Spain
- Prefers concise answers with code examples
```

**Rationale**: Clear section header helps the LLM recognize this as contextual facts, not instructions. Bullet-list format is token-efficient and easy to parse.

## Risks / Trade-offs

**[LLM extraction quality]** → The extraction model may produce inaccurate facts or miss important ones.

- _Mitigation_: Start with a well-crafted prompt. Log extracted facts for monitoring. Future: confidence scoring, user confirmation UI.

**[Over-extraction]** → The system may extract trivial facts ("the user asked about weather" ≠ "the user is interested in meteorology").

- _Mitigation_: Prompt engineering to set a high bar for what constitutes a "persistent fact". The extraction prompt should explicitly distinguish one-time questions from durable user traits.

**[Duplicate facts despite dedup]** → The 0.85 similarity threshold may not catch all duplicates.

- _Mitigation_: Acceptable for MVP. If a user accumulates 50+ facts, some duplication is tolerable. Future: periodic consolidation pass.

**[Token budget for system prompt]** → If a user accumulates many preference facts, the always-on injection grows.

- _Mitigation_: Cap preferences at ~10 facts. For MVP, unlikely to be an issue. Future: LLM-based consolidation of related preferences.

**[Embedding model alignment]** → Using `RETRIEVAL_QUERY` task type for short facts (designed for documents) may not be optimal.

- _Mitigation_: Test with `SEMANTIC_SIMILARITY` task type if available. The 768-dim space should handle short texts well enough for MVP.
