# 03: Mocks en `inference/testing` y alias de capacidad con invariantes

**What to build:** los constructores de mock del AI SDK (modelo genérico, embeddings, streams y los cinco comportamientos: ejecución de tools, visión, razonamiento, rechazo, error a mitad de stream) viven en el subpath `inference/testing`, sin ningún id de modelo. La tabla de alias de capacidad se queda en los tests del chatbot, tipada con `InvocableModelId` de `models`, y cada alias declara lo que su mock asume del Model Catalog. Un test unitario nuevo falla, nombrando el alias y la propiedad, cuando el catálogo deja de cumplirlo. La suite e2e pasa sin cambios en los specs.

**Blocked by:** 02 (kit con inyección de `languageModel` por entrada de catálogo).

**Status:** ready-for-agent

- [x] `inference/testing` exporta `createMockModel`, `createMockEmbeddingModel`, los helpers de stream y los cinco comportamientos como `MockModelEntry` sin id; el paquete principal no importa nada de `testing`.
- [x] `CAPABILITY_ALIASES` permanece en los tests del chatbot, con `satisfies` sobre `InvocableModelId` de `models`; cada alias pasa a `{ id, requires }` donde `requires` declara lo que el mock asume: entrada de imagen (`canSeeImages`), razonamiento (`canProduceReasoning`), temperatura distinta de otro alias (`alwaysRefuses` vs `basicChat`), mock genérico obligatorio (`basicChat`, `basicChatAlt`).
- [x] La composición raíz de test del chatbot construye el resolutor `entrada de catálogo → alias → comportamiento` a partir de esa tabla y los constructores del paquete; el registro por id de catálogo del ticket 02 desaparece.
- [x] Test unitario de invariantes de alias: por cada alias, la entrada del catálogo cumple `requires`; los alias apuntan a modelos distintos; los alias de mock genérico no tienen comportamiento asociado. El mensaje de fallo nombra alias y propiedad incumplida.
- [ ] Los helpers de e2e (selector de modelo, cabecera del hub) siguen resolviendo alias → nombre de modelo sin cambios de API para los specs.
- [x] `tests/AGENTS.md` del chatbot actualizado: dónde viven los constructores, cómo se añade un alias con `requires`, qué comprueba el test de invariantes.
- [x] `pnpm verify:fast` en verde.
- [x] `pnpm test:e2e` en verde.

## Comments

### 2026-09-24 — merged

Merge commit: `ccac14e8` (`merge: ticket 03 — mocks in inference/testing and capability aliases with invariants`, into `feat/inference-kit`). Implementer commits merged (`git log --oneline --reverse 9726aa90..inference-kit/03-mocks-testing-alias`, oldest first):

- `b135aefc` feat(inference): move AI SDK mock builders to inference/testing
- `83d233b9` refactor(chatbot): resolve capability-alias mocks through inference/testing
- `64f6fbae` test(coding-agent): cover the inference/testing subpath from plain tsx

**Conflicts and how they were resolved** (both against ticket 06, already merged; matched the `git merge-tree` preview exactly, no surprises):

1. Content conflict in `packages/chatbot/lib/infrastructure/ai/inference-kit.ts`: 06 added the `speechModel` real-vs-mock switch (`createMockSpeechModel`, imported from `@/tests/mocks/ai`); 03 rewrote the test-mode language-model resolution as catalog entry → alias → behaviour (`ALIAS_BEHAVIOURS`/`CAPABILITY_ALIASES`/`CapabilityAlias`, imported from `@/tests/mocks/ai/capabilities`), replacing ticket 02's id-keyed `MOCK_MODELS` registry. Kept both: `buildTestClients` uses 03's alias resolver, `speechModel` uses 06's switch, now importing `createMockEmbeddingModel`/`createMockModel`/`createMockSpeechModel` together from `inference/testing` instead of the deleted `@/tests/mocks/ai` barrel.
2. Modify/delete on `packages/chatbot/tests/mocks/ai/index.ts`: kept 03's deletion (`git rm`) — the whole barrel and its backing modules (`registry.ts`, `createMockModel.ts`, `types.ts`, `helpers/`) are superseded by `inference/testing` + `tests/mocks/ai/capabilities.ts`. `createMockSpeechModel` (06's addition to the old `createMockModel.ts`) was carried through git's rename detection into the moved `packages/inference/src/testing/mock-model.ts` automatically (no conflict reported on that file — verified the function body landed there intact). It was **not** yet exported from the new `src/testing/index.ts` (that file is 03's own new addition and predates 06), so I added the missing export line there plus updated its module doc-comment, and confirmed `inference-kit.ts`'s `speechModel` now imports it from `inference/testing`. Grepped the whole repo afterwards for leftover imports of `tests/mocks/ai/{registry,createMockModel,types,helpers}` or the deleted barrel itself — none found; `tests/mocks/ai/` now holds only `capabilities.ts`.

**Verified in the integration worktree:** `pnpm install --frozen-lockfile` (only `packages/inference/package.json` changed, adding the `"./testing"` export entry — no dependency/lockfile changes; install was a no-op). `pnpm verify:fast` green — lint + type:check + unit/component/integration/contract across all 6 workspace projects (exit 0; this also ran automatically via the pre-commit hook before I re-ran it standalone). Both `build:verify` compile steps green: `pnpm --filter coding-agent build:verify` (`dist/verify` + `.pi-verify/models.json`) and the chatbot `next build` with `export NEXT_BUILD_DIR=.next/verify` (per the `npx`-alias footgun in `00-environment.md`); confirmed `packages/chatbot/.next/verify/BUILD_ID` exists and is fresh.

**Deviation — pending operator decision** (checklist item 5 left unticked on purpose): the alias table's `{ id, requires }` shape (replacing the old plain display-name string) forced appending `.id` in 6 lines across two e2e specs that read `CAPABILITY_ALIASES` directly to build local constants for panel/tab-title assertions, not through the helpers: 5 lines in `tests/e2e/chat/hub.spec.ts` (`TOOLS_MODEL`, `FAILING_MODEL`, `VISION_MODEL`, `BASIC_MODEL`, `BASIC_ALT_MODEL`) and 1 in `tests/e2e/chat/hub-sidebar-update.spec.ts` (`TOOLS_MODEL`). This was already done by the ticket 03 implementer, not something I added. The e2e **helpers'** API is genuinely unchanged (`ModelPickerComponent.selectModel()` / `HubHeaderComponent.addModel()` keep the exact same signature, only their internal lookup adapted to read `.id` off the alias object), so checklist item 5's narrow claim about the helpers holds — but the ticket's own top-line promise ("la suite e2e pasa sin cambios en los specs") does not, hence leaving it unticked rather than silently declaring full compliance. `pnpm test:e2e` itself was not run here (orchestrator runs it, serialized, after tickets 04 and 05 are merged); left unticked as instructed.

### 2026-09-24 — e2e verified (ticket 07 merger)

Per the orchestrator's `11-e2e-log.md`: e2e ran at commit `0238a443` (integration tip, tickets 01–06 merged) — 27 passed, 10 skipped, the same 9 pre-existing baseline failures, no new failures vs. the `main`-code baseline. Ticking the `pnpm test:e2e` line above accordingly.

