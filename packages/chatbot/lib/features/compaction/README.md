# Compaction

Turns a long chat into a durable summary (`ChatSummary`) when the conversation
nears the model's context limit, then rebuilds the context from that summary.

## Public surface

`lib/features/compaction/index.ts`:

| Export | Responsibility |
| :-- | :-- |
| `compact(chatId, settings, signal?)` | Public entry: read the chat, decide whether/what to summarize, persist the summary. |
| `prepareCompaction(chatId, keepRecentTokens)` | Cut point + previous summary + token count, without inferring or writing. |
| `generateSummary(messages, previousSummary?)` | Initial or incremental summary of the compacted turns. |
| `generateTurnPrefixSummary(messages)` | Summary of an interrupted assistant turn prefix. |
| `rebuildContext(chatId, messages, systemPrompt?)` | Filters the messages already summarized and prepends the latest summary. |
| `findCutPoint`, `shouldCompact`, `serializeMessages`, `estimate*Tokens` | Pure rules (independently tested). |

## Inference

Compaction owns its concrete inference call (`summary-generation.ts`):
`generateText` through the shared kit (`inferenceKit.languageModel`), with the
Default Model Contract as `model` — `reasoning-default` for text turns,
`vision-default` when any turn carries a `file` part — a fixed system prompt and
`temperature: 0.1`. `modelUsed` persists the contract name as provenance.

There is no AI port, adapter or factory parameter for injection: tests replace
the Model Gateway at its **HTTP seam** (ADR 0013), not the feature's inference.
`orchestration.ts` also calls the kit directly; nothing above `compact` composes
inference on the feature's behalf.

## Tests and the guarantees they now own

`tests/unit/compaction/`:

| Test | Resources | Guarantees |
| :-- | :-- | :-- |
| `summary-generation.test.ts` | MSW (`createGatewayScenario`) only | Contract selection (text / multimedia), temperature and non-streaming shape of the request, system prompt, initial vs incremental prompt construction, turn-prefix prompt, returned `summary`/`modelUsed`, error propagation. |
| `compaction-flow.test.ts` | PGlite (`setupTestDb`) + MSW | Summary persisted with `modelUsed`/`tokensBefore`/`messageId`, no summary for an empty chat, abort signal respected, nothing persisted when summarization fails. |
| `cut-point`, `serialize-messages`, `should-compact`, `token-estimation` | none (pure) | Unchanged: sizing/threshold/cut-point and serialization rules. |

All of them pass without a gateway listening on `:4001`; MSW answers the
requests in-process.

### Replacement map (removed double → where its guarantee lives)

| Removed | Guarantee now verified in |
| :-- | :-- |
| `CompactionAiPort` + `adapters/ai-adapter.ts` | Deleted. The feature's own `generateModelText` sends the same contract/system/prompt/temperature, asserted from the recorded `/v1/chat/completions` request in `summary-generation.test.ts`. |
| `generateSummary(ai, …)` / `generateTurnPrefixSummary(ai, …)` fake AI (`buildAiPort`) | `summary-generation.test.ts`: contract, temperature and prompt are asserted from the HTTP request; the summary comes from the Gateway reply. |
| `compact(ai, …)` fake AI (`buildAiPort` in the old integration flow) | `compaction-flow.test.ts`: the persisted `modelUsed` is the contract that went over HTTP (`reasoning-default`), and the recorded request count proves whether inference ran at all. |
| `compactionAi` argument of `makeProcessChatResponse` (and its fake in `tests/integration/chat/*`) | Removed; those tests call the real `compact` through the factory without injecting inference. |
| Old `tests/integration/compaction/compaction-flow.test.ts` | Moved to `tests/unit/compaction/compaction-flow.test.ts` (same file, now PGlite + MSW). Cleanup stays scoped to the test's own rows in a dedicated in-memory database. |
