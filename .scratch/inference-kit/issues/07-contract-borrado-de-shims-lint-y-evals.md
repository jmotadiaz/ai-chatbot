# 07: Contract — borrado de los reexports, regla de lint y evals vía kit

**What to build:** el chatbot importa el kit únicamente a través de su módulo de composición raíz; los reexports transitorios (`languageModelConfigurations`, `providers` en infraestructura) han desaparecido junto con la feature `foundation-model` en su forma actual (la configuración isomorfa para la UI se conserva). El lint impide importar el kit desde componentes de cliente y importar SDKs de proveedor fuera del paquete. El simulador de evals resuelve modelos a través del kit.

**Blocked by:** 03, 04, 05, 06 (todas las migraciones de consumidores).

**Status:** ready-for-agent

- [x] Borrados los reexports de `languageModelConfigurations` y `providers`; todas las features importan la instancia raíz. La configuración de modelos para la UI (ids invocables, capacidades por modelo, default) permanece en un módulo isomorfo que solo depende de `models`.
- [x] Regla `no-restricted-imports` en el lint del chatbot: los ficheros con `"use client"` no importan `inference` ni el módulo de composición raíz; fuera de `packages/inference` nadie importa `@ai-sdk/*` de proveedor, `@openrouter/ai-sdk-provider` ni `@openrouter/sdk` (`ai`, `@ai-sdk/react` y `@ai-sdk/provider` siguen permitidos). Las dependencias de proveedor se retiran del `package.json` del chatbot.
- [x] El simulador de evals y los scorers que hoy llaman a proveedores directamente resuelven por id o rol a través del kit; ningún id de proveedor (`provider/model`) queda en los evals.
- [x] README del paquete: responsabilidad (fachada fina, no anticorrupción), regla de dependencia (cliente y Pi solo ven `models`), supuestos de runtime Node, cómo añadir un endpoint kind, un rol o un comportamiento de mock.
- [x] `AGENTS.md` raíz: `inference` en la estructura del monorepo y en el grafo de dependencias; nota de que el worker puede consumirlo pero no lo hace todavía.
- [x] `pnpm verify:fast`, `pnpm test:e2e` y `pnpm build:verify` en verde. Sin tocar pm2 ni `build`.
- [ ] Arranque comprobado con `pnpm dev` (nunca pm2 ni `build`).

## Comments

### 2026-09-24 — merged

Merge commit: `143e53c6` (`merge: ticket 07 — contract phase: shims removed, lint boundary, evals through the kit`, into `feat/inference-kit`). No conflicts — 07 branched from ticket 05's closing commit (`0238a443`), which was still the integration tip at merge time. Implementer commits merged (`git log --oneline --reverse 0238a443..inference-kit/07-contract`, oldest first):

- `47857989` refactor(chatbot): delete transitional inference re-exports; resolve through the composition root everywhere
- `b32051e0` test(chatbot): resolve eval models through the inference kit instead of raw provider ids
- `99b116e1` chore(chatbot): drop provider SDK dependencies now owned by packages/inference
- `23732920` feat(chatbot): lint rules for the inference dependency boundary
- `31466147` docs(inference): add the package README; refresh root AGENTS.md for the contract phase

**Verified in the integration worktree:** `pnpm install --frozen-lockfile` (chatbot's `package.json` dropped the provider SDK deps; 86 packages removed, lockfile already consistent). `pnpm verify:fast` green — lint + type:check + unit/component/integration/contract across all 6 workspace projects (exit 0). Both `build:verify` compile steps green: `pnpm --filter coding-agent build:verify` (`dist/verify` + `.pi-verify/models.json`) and the chatbot `next build` with `export NEXT_BUILD_DIR=.next/verify` (per the `npx`-alias footgun in `00-environment.md`); confirmed `packages/chatbot/.next/verify/BUILD_ID` exists afterwards, plain `.next` untouched, and `git status` clean (both output dirs gitignored).

Cross-checked each ticked box directly rather than trusting the diffstat:
- No live `languageModelConfigurations`/`providers` reexports remain (`lib/infrastructure/ai/providers.ts` and `lib/features/foundation-model/server.ts` deleted; the only hit for the old symbol name is a doc-comment in `inference-kit.ts` noting it's gone); every feature file touched by the merge now imports `inferenceKit`/`speechModel` from the composition root directly. `lib/features/foundation-model/config.ts` (invocable ids, per-model capabilities, default model) imports only from `"models"`.
- Lint boundary spot-checked directly, not just read: added a throwaway `"use client"` file importing `inference` (fired `local/no-inference-in-client-components`) and a throwaway server file importing `@ai-sdk/openai` (fired `no-restricted-imports`, plus a bonus `import-x/no-unresolved` confirming the dependency really is gone from `package.json`); both files deleted immediately after, never staged or committed.
- `tests/evals/lib/simulator.ts` and its scorers (`fact-recall.ts`, `compaction.eval.ts`) now call `inferenceKit.languageModel(<catalog id>)`; grepped the whole `tests/evals/` tree for provider/model literal patterns (`"openai/…"`, `"anthropic/…"`, etc.) — the only two hits are prose (the package README) and eval-scenario sample text (a dataset question that mentions `@openrouter/sdk` by name), not imports or model keys.
- `packages/inference/README.md` covers all four asked points: responsibility (thin facade, "not an anti-corruption layer", stated up front), dependency rule (client components and Pi's agent loop only ever see `models`), Node runtime assumptions (`randomUUID`, `tracing`'s `AsyncLocalStorage`, importable from plain `tsx`), and "How to add things" (new endpoint kind, new Model Role, new mock behaviour).
- Root `AGENTS.md`: `inference` is documented in the monorepo structure, and the dependency graph now shows `coding-agent → inference → { config, models }`, with a note that the worker depends on it today only to keep its contract test passing, not as a real runtime consumer yet.

**Pending code review** (not treated as a blocker on the boxes ticked above, flagging for a human pass): `lib/features/foundation-model/types.ts` still re-exports `ModelConfiguration`/`ProviderOptions`/`RerankResult` from `inference` and holds the legacy `ModelRoutingMetadata`, so the foundation-model folder is not yet *only* the isomorphic UI config — `config.ts` is isomorphic, `types.ts` still bridges to `inference`.

**Left unticked on purpose** (last checkbox, split in two): `pnpm verify:fast` and `pnpm build:verify` are confirmed green above; `pnpm test:e2e` is deferred to the orchestrator (serialized run across the whole integration branch, per `00-environment.md`); `pnpm dev` arranque cannot be checked on this machine (no `.env.dev` — the same gap `11-e2e-log.md` records for ticket 02) and stays pending for the operator.

### 2026-09-24 — e2e verified (ticket 08 merger)

Per the orchestrator's `11-e2e-log.md`: e2e ran at `31466147` (this ticket's own tip, same code as its merge) — 27 passed, 10 skipped, the same 9 pre-existing baseline failures, no new failures vs. the `main`-code baseline. Ticking the `pnpm verify:fast` / `pnpm test:e2e` / `pnpm build:verify` line accordingly (all three now confirmed green). `pnpm dev` arranque stays unticked: this machine still has no `.env.dev`, so it remains pending for the operator.
