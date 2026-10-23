# Agent Instructions (Global — Monorepo Root)

## Producción está VIVA — blindaje (approval-first)

En esta máquina hay un servicio de Producción en vivo supervisado por pm2: app
`ai-chatbot` (raíz, `pnpm preview`, configuración tipada de prod) → chatbot
`:8085`, worker `:3015`, postgres-prod `:5435`.

- **PROHIBIDO sin aprobación explícita del operador para cada acción**: cualquier
  comando que impacte esa ejecución — `pm2 restart|reload|stop|delete|save`,
  `pnpm preview`, `build` de prod, `docker compose … prod down`,
  o matar procesos en 8085/3015/5435. Al pedir aprobación, indica la ventana de
  indisponibilidad (un restart de `preview` tarda ~1–2 min por el rebuild).
- Verificación de compilación sin tocar prod: `type:check`, `lint` y suites de
  tests por paquete. Para comprobar que prod compila sin pisar los artefactos
  que sirve pm2, el agente ejecuta **siempre `build:verify`** (raíz:
  `pnpm build:verify`; o por paquete `pnpm --filter chatbot build:verify`
  + `pnpm --filter coding-agent build:verify`) — escribe a directorios
  aislados `.next/verify` / `dist/verify` / `.pi-verify` (gitignored, descartables).
  **NUNCA `build`** — pisa `.next`/`dist`/`.pi-prod/models.json`
  de prod bajo pm2 y rompería la ejecución en curso; reservado a operador/CI
  con `ALLOW_PROD_BUILD=1` (ver `build` en cada package).
- Nota de transición (ADR 0011): la definición guardada en pm2 todavía registra
  `env_file: .env.prod`, un fichero que ya no existe. El proceso vivo no lo lee
  (la config es tipada y `preview` usa `--env=prod`); `ecosystem.config.js` ya no
  lo declara. Si un reinicio controlado se quejara del fichero, usa
  `pm2 start ecosystem.config.js` y `pm2 save` **con aprobación del operador**.
- Verificación del servicio real: solo comandos de lectura — `pm2 ls`,
  `pm2 logs --nostream`, `curl` (GET al chatbot 8085; **NUNCA `POST /rpc` al
  worker 3015** — un body malformado tumbó el worker el 2026-09-02; para el
  worker solo `ss -tlnp`/logs), `ss -tlnp`.
- Iteración dev/test: `pnpm dev` con sus DBs (5433 dev / 5434 test), nunca con pm2. Para parar sin riesgo usa **siempre por puerto** — `pnpm stop:dev` (mata `3000`+`3016`) y `pnpm stop:test` (mata `3001`), o por paquete `pnpm --filter chatbot stop:dev` / `pnpm --filter coding-agent stop:dev` (usan `lsof -ti:PORT | xargs -r kill`). **Nunca `pkill -f "tsx ..."`** — `dev` y `prod` comparten el mismo `tsx src/transports/http.ts` y matarías el worker de prod (`3015`) dentro del `concurrently` de `preview` (cae `8085` aunque `pm2 ls` siga `online`).

## Package Manager

Use **Node.js 24** and **pnpm 11** (workspace mode). Common root scripts (para el agente):

- `pnpm dev` — start all services (chatbot + coding-agent) en el Entorno de
  Desarrollo (`--env=dev`: 3000+3016, pg 5433)
- `pnpm stop:dev` — mata `3000`+`3016` por puerto (`lsof -ti:PORT | xargs -r kill`); `pnpm stop:test` — mata `3001` (+ `docker compose -f docker-compose.test.yml down`). Por paquete: `pnpm --filter chatbot stop:dev` (3000) / `stop:test` (3001); `pnpm --filter coding-agent stop:dev` (3016)
- `pnpm build:verify` — verificación aislada de compilación (`.next/verify` + `dist/verify`+`.pi-verify`); **única vía del agente para comprobar compilación sin tocar prod**
- `pnpm verify:fast` — lint, type-check, and run unit/component/integration/contract tests
- `pnpm lint:fix` — lint all packages
- `pnpm type:check` — check TypeScript types across all packages
- `pnpm test:unit` / `pnpm test:component` / `pnpm test:integration` / `pnpm test:contract` — fast test suites
- `pnpm test:gateway` — tests del Model Gateway (`python3 -m pytest packages/model-gateway/tests -q`)
- `pnpm test:e2e` — Playwright E2E tests (Entorno de Test `--env=test`: pg 5434, worker stub, Mock Gateway `:4001`)
- `pnpm db:generate` / `pnpm db:push` — Drizzle ORM schema
- `pnpm db:dev:*` / `db:test:*` / `db:seed:*` — gestión y seeds de DB para Entornos de Dev (5433) y Test (5434)

Test ownership follows package ownership. Within each package, keep pure logic
under `tests/unit`, rendered UI under `tests/component`, multi-module or
in-process infrastructure checks under `tests/integration`, and public package
boundary checks under `tests/contract`. Repository-level Playwright scenarios
remain under `tests/`.

## Commit Attribution

AI commits MUST include:

```
Co-Authored-By: (the agent model's name and attribution byline)
```

Example: `Co-Authored-By: Claude Sonnet 3.5 <noreply@example.com>`

## Monorepo Structure

```
packages/
├── chatbot/        # Main Next.js web application
├── coding-agent/   # Coding agent HTTP worker
├── model-gateway/  # Model Gateway (LiteLLM Proxy stateless); único proveedor de IA
├── config/         # Configuración tipada por Entorno (TS, sin process.env)
└── tracing/        # Shared tracing/observability library
tests/              # E2E tests (Playwright)
```

### `config` — Configuración tipada por Entorno (ADR 0011)

**No hay `.env.*` ni variables de entorno selectoras.** La configuración son módulos
TypeScript con validación en compilación:

- `src/types.ts` — `Entorno = "prod" | "dev" | "test"`, `StructuralConfig`, `SecretsConfig`,
  `AppConfig = Readonly<StructuralConfig & SecretsConfig>`.
- `src/config.{prod,dev,test}.ts` — configuración estructural versionada (`satisfies
  StructuralConfig`), con rutas portables vía `repoPath()`/`packagePath()` (`src/paths.ts`
  descubre `REPO_ROOT` desde `import.meta.url` hasta `pnpm-workspace.yaml`). La excepción
  histórica de prod (`codingAgentSessionsDir`, `codingAgentProjectsRoot`) conserva los
  valores vivos de ADR 0002.
- `src/secrets.{prod,dev}.ts` — secretos reales, **gitignored**, importados
  estáticamente: si faltan, `tsc` y el bundler fallan en compilación (nunca en runtime).
  `src/secrets.test.ts` (falso, versionado) y `src/secrets.example.ts` (plantilla).
- `src/env.{prod,dev,test}.ts` — bundle congelado (`Object.freeze`) `config.<env>` +
  `secrets.<env>`, validado por `src/guardrails.ts` (Entorno↔DSN↔puerto del Gateway).
  Re-exporta `src/surface.ts` (tipos, constantes del contrato del Gateway, rutas,
  `optional`) para que el alias del bundler mantenga la API completa.
- `src/config.ts` — selector + fachada `config` (`config.postgresUrl()`,
  `config.entorno()`, …) sobre el bundle activo. Orden de resolución:
  `initConfig(entorno)` → `--env=prod|dev|test` en `process.argv` → detección del runner
  (`vitest`/`@playwright/test`) → `ConfigError` de fallo rápido.

**Selección de Entorno:**

- `coding-agent`, migraciones, seeds y `mcp-server` exigen `--env=prod|dev|test` en
  `process.argv`. `process.argv` pertenece solo al proceso invocado: el kernel no lo
  clona en `fork()`/`execve()`, así que un subproceso lanzado por el worker (p. ej.
  `pnpm test`) jamás hereda el Entorno del padre (incidente ADR 0011).
- `vitest.config.ts` / `playwright.config.ts` llaman `initConfig("test")` al cargarse y
  aliasan `"config"` a `packages/config/src/env.test.ts`.
- `chatbot` usa el micro-launcher `packages/chatbot/scripts/next-cli.ts` (el CLI `next`
  rechaza flags desconocidos y `next dev` no reenvía `argv` al servidor). El launcher
  llama `initConfig()` en el mismo proceso y `next.config.ts` fija
  `turbopack.resolveAlias` + `webpack.resolve.alias` de `"config"` al bundle del
  Entorno. Tradeoff: importa `next/dist/server/lib/start-server` y
  `next/dist/cli/next-build` (APIs internas) — al subir de major de Next hay que
  revisar las firmas (contrato en `tests/contract/next-internals.test.ts`).

**Reglas duras:**

- En `src/` de cualquier paquete no se usa `process.env` para configuración. Las
  variables `NEXT_PUBLIC_*` ya no existen.
- Nunca reintroduzcas un selector de Entorno por variable de entorno ni un cargador
  `.env`: cualquier subproceso heredaría el Entorno del padre.
- Tests de `coding-agent`: prohibido mutar `process.env.CODING_AGENT_*` /
  `process.env.MODEL_GATEWAY_*`. Usa `createTestWorkerContext()`
  (`packages/coding-agent/tests/helpers/test-context.ts`) e inyecta el sandbox
  (prohibido escribir en `.pi-prod`/`.pi-dev`); contrato en
  `tests/contract/no-process-env-mutations.test.ts`.

### `model-gateway` — Model Gateway (único proveedor de IA)

Servicio `packages/model-gateway` desacoplado del monorepo (sin dependencias de workspace;
extraíble con `mv` + `git init`): **LiteLLM Proxy stateless** (`config.yaml`, sin DB)
envuelto en un micro-entrypoint FastAPI (`server.py`), desplegado como unidad systemd
(`model-gateway.service`, `:4000`). Véase `packages/model-gateway/README.md`.

- **Único proveedor de IA** de chatbot y coding-agent: no hay claves de proveedores
  externos (`OPENAI_API_KEY`, `OPENROUTER_API_KEY`, …) en el repo — se custodian
  cifradas en el host con **`systemd-creds`** (`LoadCredentialEncrypted=`), gestionadas
  con `packages/model-gateway/scripts/manage-creds.sh`.
- **Catálogo en runtime**: `GET ${MODEL_GATEWAY_URL}/v1/models/catalog` (bearer
  `MODEL_GATEWAY_API_KEY`) filtra en el servidor las entradas `user_invocable: true` y
  devuelve el esquema limpio de metadatos. `chatbot` lo consume para el Model Picker y
  `<ModelCatalogProvider>`; `coding-agent` lo consume al arrancar para escribir el
  `models.json` de Pi con un único provider `model-gateway`.
- **Default Model Contracts**: los usos internos no seleccionables invocan directamente
  los nombres estables garantizados por el Gateway — `fast-default`, `flash-default`,
  `vision-default`, `reasoning-default`, `free-default`, `image-default`,
  `embedding-default`, `rerank-default`, `decision-default`, `tts-default` — sin catálogo
  tipado estático.
- **Mock Model Gateway** (test): `config.test.ts` fija `modelGatewayUrl` en
  `http://127.0.0.1:4001` (guardarraíl de `packages/config/src/guardrails.ts`), el mock
  HTTP de `packages/chatbot/tests/mocks/gateway/` que sirve el catálogo de capacidades
  de test y respuestas deterministas.
- **Fachada en el chatbot**: `packages/chatbot/lib/infrastructure/ai/inference-kit.ts` es
  el composition root (`inferenceKit`, `speechModel`), un cliente único OpenAI-compatible
  contra `${MODEL_GATEWAY_URL}/v1`. Sin `isTestMode()`: en test también se habla HTTP
  contra el `:4001`. Tipos isomorfos y helpers puros del catálogo en
  `packages/chatbot/lib/features/foundation-model/config.ts`, hidratado a cliente vía
  `<ModelCatalogProvider>` (`app/(chat)/layout.tsx`) — los `"use client"` nunca
  importan el kit.
- **Fronteras de lint** (`packages/chatbot/eslint.config.mjs`): un fichero con
  `"use client"` no puede importar `@/lib/infrastructure/ai` (exacto o cualquier subpath),
  y ningún fichero fuera de `packages/chatbot/lib/infrastructure/ai/` puede importar
  `@ai-sdk/*` salvo `@ai-sdk/react` (UI). Ambas reglas tienen contrato en
  `packages/chatbot/tests/contract/eslint-boundaries.test.ts`.

### `chatbot` — Main Application

Full-stack Next.js 16 app (App Router). AI chatbot with multi-model support, RAG, coding agent integration, image editing, and project management.

### `coding-agent` — Worker Process

Separate HTTP worker that wraps `@earendil-works/pi-coding-agent`. Manages coding agent sessions, translates Pi events into AG-UI protocol events, and exposes an `/rpc` HTTP endpoint. The chatbot communicates with this worker to run coding tasks.

First-party extensions (the `subagent` tool and the `artifacts` tool) live under `packages/coding-agent/extensions/` and are handed to the SDK as `additionalExtensionPaths`, instead of being installed with `pi install` into the machine-wide `~/.pi/agent/settings.json`. See `packages/coding-agent/AGENTS.md`.

### `tracing` — Shared Library

Reusable observability library used by both `chatbot` and `coding-agent`. Provides AI SDK middleware to capture LLM call traces (prompts, responses, tool calls, token usage) and writes them to disk as JSONL. Enabled via `TRACE_ENABLED=1`.

### Dependency Graph

```
chatbot ──→ coding-agent
   │              │
   ├──────────────┼──→ tracing
   ├──────────────┼──→ model-gateway (HTTP: Model Gateway / Mock Gateway en test)
   └──────────────┼──→ config
                  └
```

Los paquetes Node del workspace son `chatbot`, `coding-agent`, `config` y `tracing`; el
Model Gateway reside en `packages/model-gateway` a efectos de co-location del código, pero
es deliberadamente **independiente del workspace** (sin `workspace:*`): el único iface entre
los paquetes TS y él es HTTP (`MODEL_GATEWAY_URL`/`MODEL_GATEWAY_API_KEY` de `config`).
Los `*-default` son contratos de texto plano, no imports.

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five canonical default labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Vendored skills (local patches)

Skills under `.agents/skills/` are vendored from upstream repos and pinned by
`skills-lock.json` (`computedHash`). A re-sync overwrites local edits, and the
hash algorithm is not reproducible from this repo, so patches leave the lock
stale on purpose — keep them minimal and recorded here:

Catalog poda (2026-09-11): `.agents/skills/` went from 40 to 28 skills. Removed
were skills that cannot apply to this repo (Claude Code hooks, the pre-commit
bootstrapper, the shoehorn migration, course scaffolding), unused upstream
`in-progress` skills, and `prototype` (dropped per operator request, with its
references removed from `ask-matt`). `skills-lock.json` was pruned to match
those removals, so a re-sync cannot resurrect them; the two local-only skills
(`find-docs`, `trace-analyzer`) are intentionally absent from the lock. The 26
lock keys correspond one-to-one with the vendored directories.

- `archify` (`SKILL.md`, `references/delivery-contract.md`): writes artifacts to the OS temp directory and publishes them via the coding agent's `publish_artifact` tool instead of `--open`/`xdg-open`, returning the artifact URL to the user.
- `improve-codebase-architecture` (`SKILL.md` §2, `HTML-REPORT.md`): publishes its HTML report through the coding agent's `publish_artifact` tool instead of `xdg-open`, pins the CDN hosts the artifact viewer allows, and points at the first-party `mobile-first-artifacts` skill. The report still reaches users without this edit: the `artifacts` extension publishes temp-dir reports automatically. See `packages/coding-agent/AGENTS.md`.
- `handoff` (`SKILL.md`): saves the handoff document to the project's git-ignored `.handoffs/` folder (see root `.gitignore`) instead of the OS temp directory, with a `handoff-<topic>-<date>.md` name.
- `grilling` (`SKILL.md`): caps each round at 3 questions (the highest in the design tree when the frontier is larger), per operator preference for shorter answering rounds.
- `ask-matt` (`SKILL.md`): dropped the `/to-questionnaire` entry because that skill was pruned from the catalog.
