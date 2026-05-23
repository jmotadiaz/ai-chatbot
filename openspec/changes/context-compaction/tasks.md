## 1. Database

- [x] 1.1 Create `chat_summary` table schema in `lib/infrastructure/db/schema.ts` with Drizzle
- [x] 1.2 Add `chat_summary` relations to Drizzle schema
- [x] 1.3 Run `pnpm db:generate` and `pnpm db:migrate`

## 2. Module scaffold

- [x] 2.1 Create `lib/features/compaction/` directory structure
- [x] 2.2 Create `types.ts` with domain types (`CompactionSummary`, `CutPointResult`, `CompactionSettings`)
- [x] 2.3 Create `index.ts` with public API re-exports

## 3. Message pruning

- [x] 3.1 Add `pruneMessages` step before compaction and before model call with `reasoning: 'before-last-message'` and `emptyMessages: 'remove'`

## 4. Token estimation

- [x] 4.1 Implement `estimateTokens()` for a single message (sum parts text length / 4)
- [x] 4.2 Add flat 4800-character estimate for image/PDF file parts
- [x] 4.3 Implement `estimateContextTokens()` with hybrid strategy (provider usage + heuristic fallback)
- [x] 4.4 Add helper to extract text content from all part types (`text`, `tool-*`, `reasoning`, `file`)

## 5. Cut point

- [x] 5.1 Implement `findCutPoint()` — walk messages newest-to-oldest, accumulate estimated tokens until `keepRecentTokens` threshold
- [x] 5.2 Ensure cut always falls between complete messages (no intra-message split)

## 6. Summary generation

- [x] 6.1 Create `prompts.ts` with system prompt for the summarizer LLM ("Do NOT continue the conversation")
- [x] 6.2 Create initial summarization prompt with the `Goal | Key Facts | Tools Used | Shared Context | Open/Pending | Next Steps` format
- [x] 6.3 Create incremental update prompt for subsequent compactions (preserve previous + merge new)
- [x] 6.4 Implement `serializeMessages()` — flatten messages to plain text for the summarizer (truncate tool outputs to 2000 chars)
- [x] 6.5 Implement `generateSummary()` — detect content type (text-only vs multimedia), select model, call LLM, return structured text
- [x] 6.6 Use Deepseek Flash v4 for text-only summarization
- [x] 6.7 Use Qwen 3.6 Plus for multimedia summarization (include images as base64)
- [x] 6.8 Implement `generateTurnPrefixSummary()` for split-turn scenarios (mirror PI's approach)

## 7. Repository layer

- [x] 7.1 Implement `repository.ts` — `saveSummary()`, `getLatestSummary(chatId)`, `getSummaryById()`
- [x] 7.2 Implement `saveSummary()` as append-only insert
- [x] 7.3 Implement `getLatestSummary()` — query most recent row by `createdAt` for a chat

## 8. Compaction orchestration

- [x] 8.1 Implement `shouldCompact(contextTokens, contextWindow, settings)` — check if threshold is exceeded
- [x] 8.2 Implement `prepareCompaction()` — find previous compaction, calculate tokensBefore, call findCutPoint()
- [x] 8.3 Implement `compact()` — orchestrate summary generation + persistence, with `AbortController` for cancellation
- [x] 8.4 Handle the three cases: no split-turn, split-turn, and incremental update (previous summary exists)

## 9. Integration into chat flow

- [x] 9.1 Integrate compaction trigger into `onFinish` in `factory.ts` — after persistence and memory extraction
- [x] 9.2 Integrate context rebuild into `processChatResponse` — if summary exists, filter messages and inject summary into system prompt
- [x] 9.3 Implement message filtering logic: exclude messages with `serial <= summary.messageId`, prepend summary to system prompt with `## Previous Context` preamble

## 10. Configuration

- [x] 10.1 Add optional `contextWindow: number` to `ModelConfiguration` type (do NOT add to individual model config files; algorithm reads from model config or defaults to 128K)
- [x] 10.2 Define defaults: `keepRecentTokens = 20000`, `reserveTokens = 16384`
- [x] 10.3 Add optional compaction settings to project-level configuration (e.g., disable compaction)

## 11. Tests

- [x] 11.1 Unit tests for `estimateTokens()` with various part types
- [x] 11.2 Unit tests for `findCutPoint()` — basic, edge cases (single message, exact threshold)
- [x] 11.3 Unit tests for `shouldCompact()` — boundary conditions
- [x] 11.4 Unit tests for `serializeMessages()` — truncation, formatting
- [x] 11.5 Integration test for end-to-end flow: send messages → trigger compaction → verify context rebuild
