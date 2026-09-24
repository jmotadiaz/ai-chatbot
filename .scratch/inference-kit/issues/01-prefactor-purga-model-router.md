# 01: Prefactor — purga del Model Router muerto y tipado del registro de proveedores

**What to build:** el chatbot compila y pasa todas las suites exactamente igual que hoy, pero la feature `foundation-model` ya no depende de nada por encima de ella (sin ciclo con los tipos del chat), el código del Model Router retirado ha desaparecido, y el registro de proveedores está tipado a partir de `ProviderKind` del Model Catalog, de forma que un kind muerto o uno nuevo sin cliente sea error de compilación.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Eliminados el módulo del Model Router deprecado, sus prompts de clasificación (categorías, complejidad, decisión de tools) y los tipos asociados (`CATEGORIES`, `COMPLEXITY_LEVELS`, `ModelRoutingMetadata`, `ModelRoutingArguments`, `ModelRoutingResult`). Ninguna referencia queda en código ni tests.
- [x] La feature `foundation-model` no importa nada de `lib/features/chat`; el ciclo feature ↔ foundation desaparece (verificable con una búsqueda de imports).
- [x] La interfaz de proveedores de lenguaje se tipa como `Record<ProviderKind, (modelId) => LanguageModelV3>` derivado de `models`; las entradas sin kind en el catálogo (`anthropic`, `google`, `deepseek` como proveedores de lenguaje) se eliminan de la interfaz, de la implementación real y del modo test. Embedding y rerank siguen donde están por ahora.
- [x] Sin cambios de comportamiento: `pnpm verify:fast` en verde y `pnpm build:verify` compila (nunca `build`).
- [x] La entrada *Model Router* del glosario en `CONTEXT.md` queda marcada como legado (el término ya no describe código vivo).

## Comments

### 2026-09-24 — merged

Merged into `feat/inference-kit` at `ef824a10` (`git merge --no-ff inference-kit/01-prefactor`), no conflicts (integration branch had not moved since the ticket branched). Implementer commits (`git log --oneline` of the merged range, oldest first):

- `a7008acb` refactor(chatbot): remove the dead Model Router module and its types
- `626bb854` refactor(chatbot): type the language-model provider registry from ProviderKind
- `2e9fc1ce` fix(chatbot): keep legacy Model Router metadata decodable
- `0f2486fe` docs(context): mark Model Router as legacy in the glossary

Verified in the integration worktree: no `package.json`/lockfile changes in the range, so `pnpm install` was skipped. `pnpm verify:fast` ran green (lint, type:check, and unit/component/integration/contract across all packages; exit 0). Cross-checked the three ticked boxes directly: `grep -rn "features/chat" lib/features/foundation-model/` returns nothing; `providers.ts`/`foundation-model/types.ts` show `Providers extends Record<ProviderKind, (modelId: string) => LanguageModelV3>` with no `anthropic`/`google`/`deepseek` language-provider keys; `CONTEXT.md`'s *Model Router* glossary entry is marked `_(legado)_`. Did not re-run `build:verify` myself — trusting the implementer's two green compile-step runs recorded in `00-environment.md`.

**Pending operator decision** (first checkbox left unticked on purpose): the implementer kept `ModelRoutingMetadata` (inline unions, in `foundation-model/types.ts`), `MessageMetadata.autoModel` (`lib/features/chat/types.ts`) and the Router Details UI in `components/chat/message.tsx` as legacy-only decoding for messages persisted before the removal — same precedent as `ChatModeRoutingReason.low_confidence`, pinned by `tests/component/chat/legacy-model-routing-metadata.test.tsx`. Everything else the first checkbox names (`router.ts`, `prompts.ts`, `CATEGORIES`, `COMPLEXITY_LEVELS`, `ModelRoutingArguments`, `ModelRoutingResult`) is gone. Operator to confirm this legacy-decoding scope is acceptable or should be revisited.
