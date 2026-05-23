## Context

Long chat sessions in ai-chatbot send all messages to the model on every request. There is no truncation, summarization, or context window management. Messages are stored in a `message` table (Postgres via Drizzle) with a `parts[]` JSON column containing text, file, tool, and source parts. The chat flow is: `page.tsx → getMessagesByChatId() → useChat({ initialMessages }) → POST /api/chat → processChatResponse() → agent.stream()`.

The model's context window varies by provider (128K-200K typical). Without compaction, a session of ~50+ messages can exceed the window, causing degraded quality or errors.

This design is informed by the compaction algorithm of the PI coding agent (tree-based session management, `findCutPoint()`, `generateSummary()`, token estimation), adapted for a web-based general chatbot with a flat message list.

## Goals / Non-Goals

**Goals:**
- Automatically summarize older messages when context usage approaches the model's window limit
- Persist summaries in a new `chat_summary` table (append-only, upsert logic for the app)
- Rebuild the context sent to the model: summary + recent non-summarized messages
- Select the summary generation model based on message content type (text-only vs multimedia)
- Trigger compaction asynchronously in `onFinish` after response persistence
- Estimate token counts using a heuristic (`chars / 4`) with provider usage data as fallback

**Non-Goals:**
- Modifying the existing message persistence or schema (messages remain immutable)
- Client-side context management (the server handles all compaction logic)
- Branch summarization (session tree navigation — not applicable to linear chat model)
- Manual compaction commands (automatic only)
- UI indicators for compacted messages

## Decisions

### Decision 1: New feature module at `lib/features/compaction/`
Compaction is a cross-cutting concern (like `memory/`), not a sub-feature of `chat/`. It has its own DB table, LLM prompts, token estimation, and orchestration logic. Keeping it separate maintains clean boundaries.

### Decision 2: `chat_summary` table (append-only, upsert logic)
Each compaction creates a new row. The app always reads the latest row (by `createdAt`) for a given `chatId`. Append-only preserves history for debugging/auditing; the read path treats it as an upsert.

Schema:
```sql
chat_summary {
  id: uuid (PK, defaultRandom)
  chatId: uuid (FK → Chat.id, not null)
  messageId: uuid (last summarized message, FK → Message.id)
  summary: text (structured summary)
  tokensBefore: integer (estimated total tokens before compaction)
  modelUsed: varchar (which model generated the summary)
  createdAt: timestamp (default now)
}
```

### Decision 3: Trigger in `onFinish` (asynchronous)
Compaction runs after response persistence and memory extraction. It checks `shouldCompact()` and, if triggered, calls `generateSummary()` asynchronously. The user's response is already streamed — compaction does not block the UX.

### Decision 4: Context rebuild in `processChatResponse` (server-side)
When loading messages for a request, if a summary exists, messages with `serial <= summary.messageId` are excluded from the model context. The summary is injected as part of the system prompt, preceded by a preamble like `## Previous Context\n{summary}`. The client always sends all messages; the server decides what to keep.

### Decision 5: Cut-point algorithm (simplified vs PI)
Messages are atomic units with `parts[]` already bundled. There is no risk of cutting between `toolCall` and `toolResult` (they live in the same assistant message). The algorithm walks messages from newest to oldest, accumulating `estimatedTokens` per message, until `accumulated >= keepRecentTokens`. The cut always falls between complete messages — no split-turn logic needed.

### Decision 6: Token estimation (chars/4 heuristic + optional provider usage)
Heuristic: `sum(all part text lengths) / 4`. Image/PDF parts use a flat 4800 chars (~1200 tokens) each. If the provider returns usage data (input tokens), that takes priority for the last known response; subsequent messages still use the heuristic.

### Decision 7: Model selection by content type
`generateSummary()` inspects the messages to be summarized:
- If any `part.type !== "text"` (e.g., file, image, PDF) → Qwen 3.6 Plus (multimodal, receives images as base64)
- If all parts are text → Deepseek Flash v4 (fast, cheap)

### Decision 8: Summary format — "Context Continuity"
Structured format optimized for LLM consumption (not human display):

```
## Goal
## Key Facts
## Tools Used
## Shared Context
## Open / Pending
## Next Steps
```

System prompt for the summarizer forces it to only output the structured summary, not continue the conversation.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Summary generation LLM call adds latency to the first request after resuming a long idle chat | The call is async in `onFinish` during active sessions; for idle chats, the cost is paid once on the first new message, then cached |
| Heuristic token estimation underestimates actual usage | The `chars/4` heuristic deliberately overestimates to be conservative |
| Summary quality degrades after multiple iterative compactions | The incremental update prompt explicitly asks to preserve all prior information and merge new content |
| Model selection by content type adds complexity | Kept simple: only two categories (text-only vs anything else); covers the vast majority of cases |
| Memory usage tracking from provider may not be available for all models | Falls back to heuristic when usage data is missing |
