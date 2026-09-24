# 02: Paquete `inference` — clientes, resolución perezosa e inyección (expand)

**What to build:** existe un paquete de workspace `inference` (forma de `tracing`: fuente TS, `lint`, `type:check`, `test:unit`, `test:contract`) que posee los clientes por endpoint kind y la resolución de Model Configuration por id, construido con `createInferenceKit(options)` y con instancia por defecto. El chatbot obtiene sus modelos a través de **un único módulo de composición raíz** en su infraestructura, que elige la instancia real o la de test; los módulos actuales (`languageModelConfigurations`, `providers`) quedan como reexports finos para que ninguna feature cambie todavía. El chat, RAG, memoria, compaction y el resto funcionan igual en dev y en e2e.

**Blocked by:** 01 (prefactor: registro tipado por `ProviderKind`, sin ciclo con chat).

**Status:** ready-for-agent

- [x] `packages/inference` creado con dependencias `ai`, los `@ai-sdk/*` de proveedor que hoy usa el chatbot, `@openrouter/ai-sdk-provider`, `models`, `config`, `tracing`; una sola versión de `ai` en el workspace. Sin `server-only`.
- [x] Clientes movidos desde infraestructura del chatbot: un módulo por endpoint kind, cabeceras de sesión y fetch con retry de 5xx de OpenCode Go incluidos. El registro es `Record<ProviderKind, …>`.
- [x] Todas las keys se leen vía `config`: las siete que hoy leen los SDKs implícitamente (Anthropic, OpenAI, Google Generative AI, xAI, Groq, Cohere, Perplexity, DeepSeek según aplique) se declaran en el catálogo de env de `config` como opcionales y secretas y se pasan explícitamente al constructor del SDK. Ningún cliente se construye ni lee configuración al importar el paquete.
- [x] `languageModel(id, { providerOptions? })` devuelve la misma Model Configuration que hoy `languageModelConfigurations` (incluido el wrap del middleware de razonamiento y el deepmerge de `providerOptions`), construida y memoizada en la primera llamada; el mapa ansioso de import desaparece.
- [x] `createInferenceKit({ clients?, languageModel? })` permite sustituir clientes por kind y modelos por entrada de catálogo; se exporta además una instancia por defecto.
- [x] Un módulo de composición raíz en infraestructura del chatbot exporta la instancia elegida; en modo test construye el kit con el resolutor de mocks actual (registro por id de catálogo). `NEXT_PUBLIC_ENV` e imports de `tests/` no aparecen en el paquete.
- [x] `languageModelConfigurations` y `providers` del chatbot pasan a ser reexports finos sobre la instancia raíz (expand); ninguna feature cambia de import en este ticket.
- [x] Unit del paquete: configuración por id para varios modelos representativos (parámetros, providerOptions, merge de overrides), y memoización (una única construcción por id). Contrato del paquete: cabeceras y user-agent de OpenCode Go y retry de 5xx contra un fetcher enlatado; el paquete y su índice se importan desde un proceso tsx sin Next.
- [x] `pnpm verify:fast` en verde; `pnpm build:verify` compila.
- [x] `pnpm test:e2e` en verde (sin regresiones nuevas frente al baseline pre-existente).
- [ ] Arranque comprobado con `pnpm dev` (nunca pm2 ni `build`).

## Comments

### 2026-09-24 — merged

Merged into `feat/inference-kit` at `7da1cbd3` (`git merge --no-ff inference-kit/02-paquete-inference`), no conflicts (integration branch had only gained ticket 01's merge + closing commit since 02 branched, as expected). Implementer commits (`git log --oneline` of the merged range, oldest first):

- `a62ef028` feat(config): declare provider API keys the inference kit reads explicitly
- `e0da208e` feat(inference): add the inference kit package
- `92c655b2` refactor(chatbot): resolve language models and providers through the inference kit
- `cf3e9115` test(coding-agent): prove the inference package imports from a plain tsx process
- `9726aa90` docs: document the inference package and refresh .env.example

**Verified in the integration worktree:** `pnpm install --frozen-lockfile` (package.json changed in chatbot, coding-agent, and the new `inference` package) resolved cleanly against the committed lockfile. `pnpm verify:fast` green — lint + type:check + unit/component/integration/contract across all 6 workspace projects including the new `inference` package (exit 0). Both `build:verify` compile steps green: `pnpm --filter coding-agent build:verify` (tsc → `dist/verify` + `.pi-verify/models.json`) and the isolated chatbot build (`export NEXT_BUILD_DIR=.next/verify; npx next build`, using `export` per the `npx`-alias footgun in `00-environment.md`); confirmed `packages/chatbot/.next/verify` exists with a fresh `BUILD_ID` and that plain `.next` holds nothing but the `verify` subdir.

Cross-checked each ticked box directly rather than trusting `10-kit-api.md` alone: `packages/inference/package.json` (single `ai@^6.0.287` matching chatbot's pin and the lockfile's one resolved version; the `@ai-sdk/*` + `@openrouter/ai-sdk-provider` + `models` + `config` deps; no `tracing`; `grep -rn server-only packages/inference` empty); `clients/index.ts`'s `buildDefaultClients()` assembling the `Record<ProviderKind, …>` registry lazily; the six new explicit `secretOptional` keys in `packages/config/src/catalog.ts` (`OPENAI_API_KEY`/`XAI_API_KEY`/`GROQ_API_KEY`/`PERPLEXITY_API_KEY`/`GOOGLE_GENERATIVE_AI_API_KEY`/`COHERE_API_KEY` — Anthropic and DeepSeek need no key of their own since ticket 01 already removed them as language-provider kinds; they're reached through the OpenCode Go proxy instead, matching the ticket's own "según aplique" hedge); `language-model.ts`'s memoized-`Map` resolver with the conditional reasoning-middleware wrap and `deepmerge` of `providerOptions`; `kit.ts`/`index.ts`'s `createInferenceKit` + default instance; the chatbot's `lib/infrastructure/ai/inference-kit.ts` composition root (only module calling `isTestMode()` for AI infra) and the thin reexports in `providers.ts` / `foundation-model/server.ts` / `foundation-model/types.ts`; the unit suite (`language-model.test.ts`: per-id configuration for representative models incl. providerOptions merge/override and reasoning-middleware wrap, memoization within and across kit instances) and the contract suite (`opencode-client.test.ts`: session header/user-agent, 5xx retry with backoff, and OpenCode Zen's no-retry asymmetry).

Noted deviations from the ticket's literal wording (pre-existing/expected, not re-litigated here):
- The four OpenCode kinds (`opencodeGo`, `opencodeGoResponses`, `opencodeGoAnthropic`, `opencodeZen`) share one client module (`clients/opencode.ts`, one shared session id/headers/retry-fetch), rather than one module per kind.
- `tracing` is not yet a dependency of `inference` (nothing in this ticket used it); tickets 05/06 add it when `createAgent` needs `wrapWithTracing`.
- The tsx-import contract (package + index import from a plain tsx process with no Next) lives in `packages/coding-agent/tests/contract/inference-import.test.ts`, with `inference` added as a `coding-agent` workspace dependency, rather than inside `packages/inference` itself.
- The chatbot's `@ai-sdk/gateway` pin is still the stale exact `3.0.16` (vs. `inference`'s `^3.0.197`); left for ticket 07.

**Left unticked on purpose** (last checkbox, split in two): `pnpm test:e2e` — the orchestrator runs the full e2e suite next, serialized on the integration branch, per `00-environment.md`. `pnpm dev` arranque — this machine has no `.env.dev`, so dev cannot be started here; also per `00-environment.md`, this is checked by the orchestrator separately, not by ticket implementers/mergers.

### 2026-09-24 — e2e verified (ticket 06 merger)

Per the orchestrator's `11-e2e-log.md`: e2e ran on `.worktrees/baseline-e2e` at commit `1803e9ef` (integration tip right after this ticket's merge) — 27 passed, 10 skipped, the same 9 pre-existing baseline failures (8 × `tests/e2e/chat/navigation.spec.ts`, 1 × `tests/e2e/chat/sidebar.spec.ts` "should navigate between chats"), no new failures vs. the `main`-code baseline (`c0caffd6`). Ticking the `pnpm test:e2e` line above accordingly. `pnpm dev` arranque stays unticked: this machine still has no `.env.dev`, so it remains pending for the operator.
