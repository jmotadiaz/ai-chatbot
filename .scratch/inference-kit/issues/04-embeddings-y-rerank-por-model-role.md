# 04: Embeddings y rerank como operaciones del kit resueltas por Model Role

**What to build:** ingesta y recuperación de RAG y la memoria de usuario generan embeddings y reordenan documentos a través del kit (`embed` y `rerank` por Model Role), con el modelo de embeddings y el de rerank declarados en el Model Catalog en lugar de ocultos en el módulo de proveedores. Cambiar cualquiera de los dos es una edición del catálogo. El comportamiento de RAG y memoria (dimensiones, taskType por consulta, topN, umbral de score) no cambia.

**Blocked by:** 02 (kit con clientes e instancia raíz).

**Status:** ready-for-agent

- [x] `models` incorpora `EMBEDDING_MODELS` (proveedor, id, dimensiones de salida, taskTypes soportados) y `RERANK_MODELS`, como datos puros fuera de `INVOCABLE_MODEL_IDS` y de `generateModelsJson`; y `MODEL_ROLES` con los roles `embedding` y `rerank` apuntando a ellos.
- [x] El kit expone `embed(role, values, { taskType })`, que aplica las dimensiones y valida el taskType contra el catálogo, y `rerank(role, { query, documents, topN })` devolviendo `{ originalIndex, score }[]`. Ambos resolubles y sustituibles vía `createInferenceKit`.
- [x] Ingesta de RAG (por lotes con el rate limiter actual), recuperación de RAG y extracción/recuperación de memoria consumen las operaciones del kit a través de sus puertos actuales; `providers.embedding` y `providers.rerank` desaparecen del chatbot.
- [x] `inference/testing` ofrece embeddings y rerank fake; la composición de test del chatbot los inyecta.
- [x] Unit del paquete: resolución por rol para embedding y rerank, invariantes de catálogo (cada rol apunta a un id existente en su catálogo). Integration del chatbot: recuperación de RAG con embeddings y rerank fake devuelve los chunks ordenados y filtrados como hoy.
- [x] `pnpm verify:fast` y `pnpm test:e2e` en verde; `pnpm build:verify` compila.

## Comments

### 2026-09-24 — merged

Merge commit: `e0a5a0e8` (`merge: ticket 04 — embeddings and rerank as kit operations by Model Role`, into `feat/inference-kit`). Implementer commits merged (`git log --oneline --reverse 9726aa90..inference-kit/04-embeddings-rerank`, oldest first):

- `56b03f12` feat(models): add embedding and rerank catalogs with Model Roles
- `72af5dab` feat(inference): add embed and rerank kit operations resolved by Model Role
- `2beb4086` refactor(chatbot): consume embed/rerank kit operations in RAG and memory
- `2d29f0d4` test(coding-agent): assert the kit's embed/rerank, not the old client shim
- `cc1ef901` test(chatbot): exercise RAG retrieve's real embed/rerank kit wiring

**Conflicts and how they were resolved** (against tickets 03 and 06, already merged; matched the `git merge-tree` preview exactly, all additive):

1. `packages/models/src/roles.ts` (add/add) and `packages/models/src/index.ts` (content, auto-merged but left a duplicated export line): `MODEL_ROLES` is now the union of 06's `LANGUAGE_MODEL_ROLES`/`SPEECH_ROLES` and 04's `EMBEDDING_ROLES`/`RERANK_ROLES` (all four spreads, roles confirmed disjoint — `embedding`/`rerank` don't collide with any language or speech role name). `index.ts`'s auto-merge had inserted `export { MODEL_ROLES, type ModelRole } from "./roles";` twice (once from each side's independent addition at a different point in the file) — TypeScript would reject the duplicate export, so I removed the redundant trailing occurrence. Also updated `roles.test.ts` (06's file, not part of the conflict but broken by the wider union): extended its "union of every role map" and "disjoint names" assertions to include `EMBEDDING_ROLES`/`RERANK_ROLES`, otherwise it would fail against the now-larger `MODEL_ROLES`.
2. `packages/inference/src/{types,kit}.ts`, `src/clients/index.ts`: kept all of 06's members (`languageModel`, `clients`, `speechModel`, `createAgent`, the `SpeechClients`/speech imports) and added 04's `embed`/`rerank` members, `EmbeddingClients`/`RerankClients` registries, and the `embeddingClients`/`rerankClients` options on `CreateInferenceKitOptions`; removed the old `embeddingClient`/`rerankClient` shims (and their now-unused `EmbeddingModelV3`/`rerank`-type imports) that 04 replaced.
3. `packages/inference/src/testing/index.ts` (add/add): union of 03's builders (`createMockModel`/`createMockEmbeddingModel`/`createMockSpeechModel`, chunk/stream helpers, the five behaviours) plus 04's `createMockRerankModel`. `package.json`'s `"./testing"` export entry turned out identical on both sides (both added it independently before 03 and 04 knew about each other), so git merged it with no conflict.
4. `packages/chatbot/lib/infrastructure/ai/inference-kit.ts`: merged the import from `inference/testing` into one statement (added `createMockRerankModel`); kept 03's alias-based `buildTestClients()` test resolver and 06's standalone `speechModel` export (speech has no per-kind override option on `CreateInferenceKitOptions`, so it can't fold into the kit construction the way embedding/rerank now do); took 04's single `inferenceKit` definition using `embeddingClients`/`rerankClients` injection instead of the old separate `embeddingClient`/`rerankClient` exports (both removed, matching `providers.ts`'s auto-merged drop of the `embedding`/`rerank` members).
5. `packages/coding-agent/tests/contract/inference-import.test.ts`: kept 03's `inference/testing` describe block and 06's `speechModel`/`createAgent` assertions, replaced the `embeddingClient`/`rerankClient` assertions with 04's `embed`/`rerank` ones.

**Verified in the integration worktree:** `pnpm install --frozen-lockfile` — no-op (`packages/inference/package.json`'s only change, the `"./testing"` export entry, was already identical on both sides pre-merge; lockfile untouched). `pnpm verify:fast` green (lint + type:check + unit/component/integration/contract, all 6 workspace projects), both standalone and via the pre-commit hook on the merge commit — includes 04's new `packages/chatbot/tests/integration/rag/retrieve-via-inference-kit.test.ts` (2/2 passed) and the package-level `embed.test.ts`/`rerank.test.ts`/`embedding-catalog.test.ts`/`rerank-catalog.test.ts`. Both `build:verify` compile steps green: `pnpm --filter coding-agent build:verify` (`dist/verify` + `.pi-verify/models.json`) and the chatbot `next build` with `export NEXT_BUILD_DIR=.next/verify` (confirmed `packages/chatbot/.next/verify/BUILD_ID` exists and no plain `.next` build output was created). Grepped the repo afterwards for `embeddingClient`/`rerankClient`/`providers.embedding`/`providers.rerank`/imports from `@/tests/mocks/ai` — the only remaining hits are the new `embeddingClients`/`rerankClients` registry-override option (expected) and one historical doc-comment describing pre-ticket-04 behavior in the new integration test.

**Notes:**

- Memory extraction/retrieval (`lib/features/memory/{extraction,retrieval}/index.ts`) call `inferenceKit.embed("embedding", …)` directly through the chatbot composition root — no port was introduced for it, per the orchestrator decision (`09-orchestrator-decisions.md`: "04 — memory has no port").
- Memory still has no automated tests of its own (no `tests/**/memory/**` in the chatbot package) — a pre-existing gap, not introduced by this ticket or this merge.
- `pnpm test:e2e` left unticked above on purpose: the orchestrator runs it, serialized, after ticket 05 is merged.

### 2026-09-24 — e2e verified (ticket 07 merger)

Per the orchestrator's `11-e2e-log.md`: e2e ran at commit `0238a443` (integration tip, tickets 01–06 merged) — 27 passed, 10 skipped, the same 9 pre-existing baseline failures, no new failures vs. the `main`-code baseline. Ticking the verification checkbox above accordingly (`pnpm verify:fast` and `pnpm build:verify` were already confirmed green in this ticket's own merge).
