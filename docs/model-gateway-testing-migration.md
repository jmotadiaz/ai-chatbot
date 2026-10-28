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
| English workflows (classification, generation, delimiters, validation, TTS contract) | `lib/features/english/workflows/ports.ts` (fake classifier/generator injectable from composition) | `packages/chatbot/tests/unit/english/workflows.test.ts`, `classifier.test.ts` — `flash-default` / `decision-default` / `tts-default` over the Gateway seam |
| Chat Mode Router in the Test Environment (real Decisions call, mode mapping, provenance, errors) | deterministic router returning `context7` by default; `DecideFn` fake and `Decision` fixtures in the unit suites | `packages/chatbot/tests/unit/chat/mode-routing/create-chat-mode-router.test.ts`, `resolve-chat-mode.test.ts`, `decide-resolved-mode.test.ts`, and `packages/chatbot/tests/integration/chat/mode-routing.test.ts` — `inferenceKit.decide` over `/v1/systemone` |
| Images (V3 prompt → OpenAI `messages`, multipart reply → `GeneratedFile`, warnings, no-files case) | duplicated transport stubs and `packages/chatbot/tests/mocks/dummy-image.png` | `packages/chatbot/tests/unit/infrastructure/gateway-image-model.test.ts` and `packages/chatbot/tests/integration/infrastructure/gateway-image-model.test.ts` — toolkit `imageReply` fixture, one PNG fixture owned by the consumer |
| RAG ingestion (chunk/vector association, batching, rate limiting, persistence, Exa side) | `lib/features/rag/ingestion/ports.ts` + `factory.ts`; `tests/integration/rag/ingestion.test.ts` | `packages/chatbot/tests/unit/rag/ingestion.test.ts`, `rate-limiter.test.ts` — `embedding-default` over the seam, MSW for the search provider |
| RAG retrieval (query decomposition, embeddings, filtering, ranking, parsing) | `lib/features/rag/retrieve/ports.ts` + `factory.ts`; `tests/integration/rag/retrieve.test.ts` and `retrieve-via-inference-kit.test.ts` | `packages/chatbot/tests/unit/rag/retrieve.test.ts` — prepared vectors/rankings through deterministic Gateway responders |
| Chat agent construction (parameter precedence, model resolution with tracing, mode composition) | `lib/features/chat/conversation/ports.ts` + `adapters/ai-adapter.ts`; `tests/unit/chat/chat-modes/neutral-branch.test.ts` (fake-agent variant) | `packages/chatbot/tests/unit/chat/chat-modes/agent.test.ts`, `mode-composition.test.ts`, and `packages/chatbot/tests/integration/chat/neutral-branch.test.ts` — the agent is built by the feature and its turns are answered at the Gateway seam |
| Coding Agent Worker Gateway catalog (URL, bearer header, payload validation, refresh/dedup, error paths) | `vi.stubGlobal("fetch", …)` in `packages/coding-agent/tests/{unit/gateway-catalog.test.ts,integration/gateway-catalog-refresh.test.ts,integration/session-manager-available-models.test.ts,integration/model-unknown-fail-fast.test.ts,contract/no-process-env-mutations.test.ts}`; hand-rolled `node:http` server in `integration/artifacts-server.test.ts` | the same files, now on `@ai-chatbot/model-gateway-testing` (MSW handlers for in-process phases, `/server` for the tests whose subject is the transport), plus `packages/coding-agent/tests/helpers/gateway-harness.ts` |
| Chatbot E2E Mock Model Gateway (SSE/JSON rendering parity, auth, catalog filtering, scripted replies, pacing, error cut, server lifecycle) | hand-written protocol and server code in `packages/chatbot/tests/mocks/gateway/server.ts` | `packages/model-gateway/js/tests` (toolkit's own protocol/server suite) for the protocol; `packages/chatbot/tests/integration/mocks/gateway/gateway.test.ts` (infra profile) for the consumer-owned catalog and named profile |
| Vitest global HTTP setup (a `:4001` gateway for EVERY vitest run) | `packages/chatbot/tests/helpers/mock-gateway-global-setup.ts` | removed: social unit tests answer inference with MSW in-process. The three route tests that silently resolved the catalog against the listening mock (`tests/unit/agent-code/{model-route,run-route-attachments,run-route-thinking-level}.test.ts`) now warm it through `tests/helpers/gateway-harness.ts`. The only vitest consumer of a listening `:4001` is the Mock Model Gateway harness test, which self-ensures the server and is selected by the infra profile |
| In-process AI SDK stream-chunk builders (`textChunks`, `reasoningChunks`, `toolCallChunks`, `fileChunks`, `errorChunk`, `finishChunk`) | `packages/chatbot/tests/helpers/stream-chunks.ts` (copied from the deleted `inference/testing` package) | removed with its last consumers: protocol fixtures of the toolkit (`textReply`, `reasoningReply`, `toolCallReply`, `imageReply`, `midStreamErrorReply`, …) describe the same wire behaviour once, over HTTP |

## Deliberately kept doubles

| Double | Why it survives |
| --- | --- |
| `MockLanguageModelV3` module mock in `packages/chatbot/tests/contract/chat/post-route-resume-persistence.test.ts` | Independent guarantee: the disconnect must land *between* SSE chunks, so the model paces its own chunks (~40 ms) while the response body is cancelled. MSW returns a whole body at once, so a scenario cannot express it; the test still warms the catalog through the Gateway harness. |
| `packages/chatbot/tests/mocks/gateway/{catalog,profiles}.ts` | Consumer-owned: capability ids, texts, pacing constants, Decisions criterion and internal-operation answers are chatbot test data, not protocol. The toolkit renders them. |
| `packages/chatbot/tests/mocks/gateway/main.ts` | Manual CLI to run the mock on `:4001` without Playwright. |
| `packages/chatbot/tests/helpers/msw-server.ts` | Not a Gateway double: it stubs the Worker/HTTP endpoints in agent-code unit and component tests. |
| Pi SDK mocks, `tracing` mocks, `createTestWorkerContext()` sandbox, git helpers | Doubles of genuinely different dependencies (Worker runtime isolation, tracing, filesystem), out of the Gateway seam's scope. |
