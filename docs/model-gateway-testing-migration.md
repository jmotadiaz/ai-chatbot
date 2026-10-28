# Model Gateway testing migration — guarantees accounting

Where the guarantees of the substituted test doubles and removed mechanisms live
after the migration described by
[ADR 0013](./adr/0013-model-gateway-testing-and-social-unit-tests.md) and the
[local implementation spec](../.scratch/model-gateway-testing/spec.md) (§7).

Read the ADR for the selection policy (social unit tests by default, E2E by
exception, dependency categories, consumer-owned scenarios). This note is only
the audit trail: for every double or mechanism that disappeared, which test file
carries its guarantee today. It records *substitutions*, not a test count, and it
does not reclassify or reduce the historical E2E suite (another issue owns that).

Execution profiles and their commands are documented in
[`packages/chatbot/tests/AGENTS.md`](../packages/chatbot/tests/AGENTS.md#execution-profiles)
and in the root `AGENTS.md` script list.

## Substituted guarantees

| Feature / guarantee | Old double or port (removed) | Verified now by |
| --- | --- | --- |
| Compaction summary generation (contract choice, prompt, temperature, returned summary, `modelUsed`, errors) | `lib/features/compaction/ports.ts` + `adapters/ai-adapter.ts` and the in-process summary fake; `tests/integration/compaction/compaction-flow.test.ts` | `packages/chatbot/tests/unit/compaction/summary-generation.test.ts` and `packages/chatbot/tests/unit/compaction/compaction-flow.test.ts` — real `inferenceKit`, MSW scenario, recorded `reasoning-default` / `vision-default` requests, PGlite persistence |
| English workflows (classification, generation, delimiters, validation) | `lib/features/english/workflows/ports.ts` (fake classifier/generator injectable from composition) | `packages/chatbot/tests/unit/english/workflows.test.ts`, `classifier.test.ts` — `flash-default` / `decision-default` over the Gateway seam (the `tts-default` contract is covered elsewhere, see the Mock Model Gateway row) |
| Chat Mode Router in the Test Environment (real Decisions call, mode mapping, provenance, errors) | deterministic router returning `context7` by default; `DecideFn` fake and `Decision` fixtures in the unit suites | `packages/chatbot/tests/unit/chat/mode-routing/create-chat-mode-router.test.ts`, `resolve-chat-mode.test.ts`, `decide-resolved-mode.test.ts` (pure mapping of an already-resolved decision), and `packages/chatbot/tests/integration/chat/mode-routing.test.ts` — `inferenceKit.decide` over `/v1/systemone` |
| Images (V3 prompt → OpenAI `messages`, multipart reply → `GeneratedFile`, warnings, no-files case) | duplicated transport stubs and `packages/chatbot/tests/mocks/dummy-image.png` | `packages/chatbot/tests/unit/infrastructure/gateway-image-model.test.ts` and `packages/chatbot/tests/integration/infrastructure/gateway-image-model.test.ts` — toolkit `imageReply` fixture, one PNG fixture owned by the consumer |
| RAG ingestion (chunk/vector association, batching, rate limiting, persistence, Exa side) | `lib/features/rag/ingestion/ports.ts` + `factory.ts`; `tests/integration/rag/ingestion.test.ts` | `packages/chatbot/tests/unit/rag/ingestion.test.ts`, `rate-limiter.test.ts` — `embedding-default` over the seam, MSW for the search provider |
| RAG retrieval (query decomposition, embeddings, filtering, ranking, parsing) | `lib/features/rag/retrieve/ports.ts` + `factory.ts`; `tests/integration/rag/retrieve.test.ts` and `retrieve-via-inference-kit.test.ts` | `packages/chatbot/tests/unit/rag/retrieve.test.ts` — prepared vectors/rankings through deterministic Gateway responders |
| Chat agent construction (parameter precedence, model resolution with tracing, mode composition) | `lib/features/chat/conversation/ports.ts` + `adapters/ai-adapter.ts`; `tests/unit/chat/chat-modes/neutral-branch.test.ts` (fake-agent variant) | `packages/chatbot/tests/unit/chat/chat-modes/agent.test.ts`, `mode-composition.test.ts`, and `packages/chatbot/tests/integration/chat/neutral-branch.test.ts` — the agent is built by the feature and its turns are answered at the Gateway seam |
| Coding Agent Worker Gateway catalog (URL, bearer header, payload validation, refresh/dedup, error paths) | `vi.stubGlobal("fetch", …)` in `packages/coding-agent/tests/{unit/gateway-catalog.test.ts,integration/gateway-catalog-refresh.test.ts,integration/session-manager-available-models.test.ts,integration/model-unknown-fail-fast.test.ts,contract/no-process-env-mutations.test.ts}`; hand-rolled `node:http` server in `integration/artifacts-server.test.ts` | the same files, now on `@ai-chatbot/model-gateway-testing` (MSW handlers for in-process phases, `/server` for the tests whose subject is the transport), plus `packages/coding-agent/tests/helpers/gateway-harness.ts` |
| Chatbot E2E Mock Model Gateway (SSE/JSON rendering parity, auth, catalog filtering, scripted replies, pacing, error cut, server lifecycle) | hand-written protocol and server code in `packages/chatbot/tests/mocks/gateway/server.ts` | `packages/model-gateway/js/tests` (toolkit's own protocol/server suite) for the protocol; `packages/chatbot/tests/integration/mocks/gateway/gateway.test.ts` (infra profile) for the consumer-owned catalog and named profile. That file also owns the chatbot's `tts-default` coverage (`POST /v1/audio/speech` → WAV), alongside the toolkit's `speechResponse`/`deterministicWav` unit in `packages/model-gateway/js/tests/protocol.test.ts`; the English Helper `generateSpeech` action has no dedicated test. |
| Vitest global HTTP setup (a `:4001` gateway for EVERY vitest run) | `packages/chatbot/tests/helpers/mock-gateway-global-setup.ts` | removed: social unit tests answer inference with MSW in-process. The three route tests that silently resolved the catalog against the listening mock (`tests/unit/agent-code/{model-route,run-route-attachments,run-route-thinking-level}.test.ts`) now warm it through `tests/helpers/gateway-harness.ts`. The only vitest consumer of a listening `:4001` is the Mock Model Gateway harness test, which self-ensures the server and is selected by the infra profile |
| In-process AI SDK stream-chunk builders (`textChunks`, `reasoningChunks`, `toolCallChunks`, `fileChunks`, `errorChunk`, `finishChunk`) | `packages/chatbot/tests/helpers/stream-chunks.ts` (copied from the deleted `inference/testing` package) | removed with its last consumers: protocol fixtures of the toolkit (`textReply`, `reasoningReply`, `toolCallReply`, `imageReply`, `midStreamErrorReply`, …) describe the same wire behaviour once, over HTTP |

## Compaction: before/after (ticket 03)

Compaction was the first vertical slice of the migration, so its before/after is
the reference for the pattern the rest of the tickets extended. The comparison is
qualitative on purpose: no thresholds, no invented numbers.

| Dimension | Before | After |
| --- | --- | --- |
| Preparation | The feature carried a test seam: `lib/features/compaction/ports.ts` (`CompactionAiPort`), `adapters/ai-adapter.ts` and the `compactionAi` parameter of `makeProcessChatResponse`, which every caller had to thread. Each test built its own in-process fake (`buildAiPort`: a `vi.fn()` resolved with a summary string) and the persistence test faked inference inside `tests/integration/compaction/compaction-flow.test.ts`. | No seam: `summary-generation.ts` calls `generateText` through `inferenceKit.languageModel`, `compact`/`generateSummary`/`generateTurnPrefixSummary` take no inference argument, and the factory no longer accepts one. A test declares the answer once (`gateway.use({ chat })`) and nothing in the feature exists only because a test substitutes inference. |
| Deleted code | Two double-only files (`ports.ts`, `adapters/ai-adapter.ts`) plus the factory parameter and its exports, and a fake-AI factory repeated per suite. | All of it is gone; the feature keeps one concrete call site and pure rules. The old integration flow was replaced by the social unit test that reuses the same PGlite setup. |
| Diagnosis clarity | A failing test pointed at the fake: a wrong mock value, or a `vi.fn` that was never called, said nothing about which contract/prompt the feature actually sent. | The toolkit only answers what the test declares — an unknown model or operation is an explicit `422`, never a generic success — and records every request, so a wrong contract, temperature or prompt is read from `scenario.requests` (model, `temperature`, `stream`, `response_format`, system/user content) and a transport failure is an HTTP status, not a fake's return value. |
| Behaviour coverage | The fake pinned its own arguments: a summary string, whether it was called, and a `modelUsed` the test itself had chosen. | The same guarantees are asserted from the real wire request, plus ones the fake could not express: real SDK serialization, contract selection (`reasoning-default` / `vision-default`), the non-streaming shape, file parts of multimedia turns, `modelUsed` tied to the contract that actually went over HTTP, error propagation, no request for an empty chat, and abort handling. Error cases are rejected with `400`, which is the non-retryable rejection a model returns. |
| Execution cost | In-process fake, but the vitest global setup still started a listening `:4001` gateway for every run. | Every call crosses MSW in-process (no socket, no port), the catalog is warmed once per file through the harness, and PGlite stands in for PostgreSQL. The marginal cost is one MSW dispatch per inference call; the fixed cost of a listening gateway per run disappeared. |

### Problems found and how they were resolved

- **Catalog warm-up.** The kit resolves the `*-default` contracts from a catalog
  snapshot it caches, so a scenario installed after the first resolution was not
  consulted and the first test of a file could run against the previous
  snapshot. Resolved in `setupGatewayHarness.use()`: it installs the scenario's
  handlers and *then* warms the catalog — the same point production uses — so the
  snapshot always comes from the current scenario. Because the cache lives per
  process, only the first call of a file hits the transport; a test that needs
  different metadata overrides `catalog` explicitly instead of racing the cache.
- **Per-test scenario installation.** The toolkit has no implicit lifecycle and
  no response queue: a test installs its own scenario and audits that scenario's
  recorded requests, and a test that needs a second phase installs a new one.
  That is deliberately more explicit than the removed global mock — it is what
  makes concurrent tests safe — but it is the main ergonomic change a future
  suite has to absorb.
- **SDK retry on 5xx.** `generateText` retries server errors, so an error test
  written as `GatewayScenarioError(…, 500)` sat through the SDK's retries before
  failing and its "one request" assertions became misleading. Resolved by
  rejecting generation with `400` (a non-retryable rejection) in the error tests;
  `500` survives only on the Decisions path, where `inferenceKit.decide` is a raw
  `fetch` with no SDK retry.
- **No global server (cold cache, unhandled requests).** With the global `:4001`
  setup removed, nothing answers a request the scenario did not declare, so the
  harness listens with `onUnhandledRequest: "error"`: an unstubbed call fails
  loudly instead of reaching a real server. Failures that used to depend on
  whatever the shared mock happened to serve are now explicit.

## Deliberately kept doubles

| Double | Why it survives |
| --- | --- |
| `MockLanguageModelV3` module mock in `packages/chatbot/tests/contract/chat/post-route-resume-persistence.test.ts` | Independent guarantee: the disconnect must land *between* SSE chunks, so the model paces its own chunks (~40 ms) while the response body is cancelled. MSW returns a whole body at once, so a scenario cannot express it; the test still warms the catalog through the Gateway harness. |
| `packages/chatbot/tests/mocks/gateway/{catalog,profiles}.ts` | Consumer-owned: capability ids, texts, pacing constants, Decisions criterion and internal-operation answers are chatbot test data, not protocol. The toolkit renders them. |
| `packages/chatbot/tests/mocks/gateway/main.ts` | Manual CLI to run the mock on `:4001` without Playwright. |
| `packages/chatbot/tests/helpers/msw-server.ts` | Not a Gateway double: it stubs the Worker/HTTP endpoints in agent-code unit and component tests. |
| Pi SDK mocks, `tracing` mocks, `createTestWorkerContext()` sandbox, git helpers | Doubles of genuinely different dependencies (Worker runtime isolation, tracing, filesystem), out of the Gateway seam's scope. |

### Decisions recorded so they are not "fixed" later

- The two consumer gateway harnesses (`packages/chatbot/tests/helpers/gateway-harness.ts`
  and `packages/coding-agent/tests/helpers/gateway-harness.ts`) stay duplicated on
  purpose: each consumer owns its MSW lifecycle and catalog warm-up, and the
  toolkit must not hide MSW behind another API, so a shared wrapper would only be
  a third lifecycle to keep in sync.
- `EmbeddingRateLimiter`'s `windowMs`, `estimateTokens` and `now` options
  parameterise a real production budget (a consumer with another quota builds its
  own limiter), not an AI port; the class is deliberately **not** re-exported from
  `lib/features/rag/ingestion/index.ts` — the feature reaches it through the
  `embeddingRateLimiter` singleton, so the explicit clock a test uses stays out of
  the production surface.
