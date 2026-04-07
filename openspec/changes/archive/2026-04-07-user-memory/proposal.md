## Why

The chatbot currently treats every conversation as a blank slate — it has no persistent understanding of who the user is. Each session starts without knowledge of the user's language preferences, professional context, or interaction style. This forces users to repeatedly re-establish context ("I work with TypeScript", "answer in Spanish", "keep it concise") and prevents the chatbot from providing truly personalized responses.

A persistent user memory system would allow the chatbot to learn and recall relevant facts about the user across conversations, making interactions progressively more natural and efficient.

## What Changes

- **New `lib/features/memory/` module** — Self-contained feature for extracting, storing, deduplicating, and retrieving user memory facts.
- **New `UserMemory` database table** — Stores categorized memory facts with vector embeddings for semantic retrieval. Added to `lib/infrastructure/db/schema.ts`.
- **Memory extraction in chat lifecycle** — After each chat response (`onFinish`), an async LLM call analyzes the conversation and extracts relevant user facts.
- **Memory injection in agent creation** — Before each chat request, relevant memory facts are retrieved (preferences always, personal/professional via semantic search) and injected into the system prompt for supported agents (excluding Context7).
- **Deduplication via semantic similarity** — New facts are compared against existing ones using embedding cosine similarity to prevent duplicates and handle updates.

## Capabilities

### New Capabilities
- `memory-extraction`: Extract user facts from conversation messages using LLM analysis. Categorize facts as personal, professional, or preferences. Generate embeddings for each fact. Deduplicate against existing facts using semantic similarity.
- `memory-retrieval`: Retrieve relevant memory facts for a given conversation context. Always include preference-category facts. Use semantic search (embedding cosine similarity) to filter personal and professional facts by relevance to the current message.
- `memory-storage`: Persist user memory facts in a dedicated `UserMemory` table with category, content, embedding, and source tracking. Support CRUD operations and semantic similarity queries via pgvector.

### Modified Capabilities
_None — this is a new system that integrates with but does not modify existing RAG or chat specifications._

## Impact

- **Database**: New `UserMemory` table with HNSW vector index. Requires Drizzle migration (`pnpm db:generate && pnpm db:migrate`).
- **`lib/infrastructure/db/schema.ts`**: New table definition, relations, and types.
- **`lib/features/chat/conversation/factory.ts`**: `onFinish` callback gains a fire-and-forget call to memory extraction.
- **`lib/features/chat/agents/factory.ts`**: `createAgent` gains a pre-flight call to load relevant memory and inject it into the system prompt.
- **`lib/infrastructure/ai/providers`**: Reused (not modified) for embedding generation.
- **LLM cost**: One additional small-model LLM call per chat response (extraction), one embedding generation per request (retrieval). Both are lightweight.
- **Latency**: Zero impact on user-perceived latency — extraction runs post-response; retrieval adds ~10-30ms (embedding generation + pgvector query on a small dataset).
