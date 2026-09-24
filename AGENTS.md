# Agent Instructions (Global — Monorepo Root)

## Producción está VIVA — blindaje (approval-first)

En esta máquina hay un servicio de Producción en vivo supervisado por pm2: app
`ai-chatbot` (raíz, `pnpm preview`, `.env.prod`) → chatbot `:8085`, worker
`:3015`, postgres-prod `:5435`.

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
- Verificación del servicio real: solo comandos de lectura — `pm2 ls`,
  `pm2 logs --nostream`, `curl` (GET al chatbot 8085; **NUNCA `POST /rpc` al
  worker 3015** — un body malformado tumbó el worker el 2026-09-02; para el
  worker solo `ss -tlnp`/logs), `ss -tlnp`.
- Iteración dev/test: `pnpm dev` con sus DBs (5433 dev / 5434 test), nunca con pm2. Para parar sin riesgo usa **siempre por puerto** — `pnpm stop:dev` (mata `3000`+`3016`) y `pnpm stop:test` (mata `3001`), o por paquete `pnpm --filter chatbot stop:dev` / `pnpm --filter coding-agent stop:dev` (usan `lsof -ti:PORT | xargs -r kill`). **Nunca `pkill -f "tsx ..."`** — `dev` y `prod` comparten el mismo `tsx src/transports/http.ts` y matarías el worker de prod (`3015`) dentro del `concurrently` de `preview` (cae `8085` aunque `pm2 ls` siga `online`).

## Package Manager

Use **Node.js 24** and **pnpm 11** (workspace mode). Common root scripts (para el agente):

- `pnpm dev` — start all services (chatbot + coding-agent) con `.env.dev` (dev: 3000+3016, pg 5433)
- `pnpm stop:dev` — mata `3000`+`3016` por puerto (`lsof -ti:PORT | xargs -r kill`); `pnpm stop:test` — mata `3001` (+ `docker compose -f docker-compose.test.yml down`). Por paquete: `pnpm --filter chatbot stop:dev` (3000) / `stop:test` (3001); `pnpm --filter coding-agent stop:dev` (3016)
- `pnpm build:verify` — verificación aislada de compilación (`.next/verify` + `dist/verify`+`.pi-verify`); **única vía del agente para comprobar compilación sin tocar prod**
- `pnpm verify:fast` — lint, type-check, and run unit/component/integration/contract tests
- `pnpm lint:fix` — lint all packages
- `pnpm type:check` — check TypeScript types across all packages
- `pnpm test:unit` / `pnpm test:component` / `pnpm test:integration` / `pnpm test:contract` — fast test suites
- `pnpm test:e2e` — Playwright E2E tests (usa `.env.test`, pg 5434, worker stub)
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
├── config/         # Central env catalog + typed config accessors (no process.env en src/)
├── inference/      # Server-side AI SDK facade: provider clients, lazy model resolution
├── models/         # Shared model catalog consumed by chatbot & coding-agent
└── tracing/        # Shared tracing/observability library
tests/              # E2E tests (Playwright)
```

### `config` — Central Env Config

Catálogo único de variables de entorno (`ENV_CATALOG` en `packages/config/src/catalog.ts`)
y acceso tipado vía el objeto semántico `config` (`packages/config/src/config.ts`).

Regla: en `src/` de cualquier paquete NO se usa `process.env` directamente; se importa
`config` (o `readEnv` para claves dinámicas documentadas). Las variables `NEXT_PUBLIC_*`
quedan fuera (Next.js las inlinea en build). El paquete deja marcada la evolución a la
credentials API de systemd en `packages/config/src/source.ts`.

### `inference` — Inference Kit

Server/Node package: a thin facade over the AI SDK. Owns the language-model clients per endpoint kind (`ProviderKind`, see `models`), reading every provider API key via `config` instead of letting each SDK read `process.env` implicitly, and the lazy, memoized resolution from a catalog id to a full Model Configuration. Built with `createInferenceKit(options)`; a default instance is also exported. No `server-only` (the package boundary is convention + lint, not a runtime import guard) and no knowledge of test environments — the chatbot's own composition root (`packages/chatbot/lib/infrastructure/ai/inference-kit.ts`) is the **only** chatbot module that picks the real kit or a kit built with the mock registry, based on `NEXT_PUBLIC_ENV`, and every feature imports `inferenceKit`/`speechModel` from it directly. The transitional reexports that used to sit on top of it while features migrated (`packages/chatbot/lib/infrastructure/ai/providers.ts` and `packages/chatbot/lib/features/foundation-model/server.ts`) are gone. Lint enforces the two dependency rules the package doc (`packages/inference/README.md`) describes: a `"use client"` file cannot import `inference` (or the composition root), and outside `packages/inference` nobody imports a provider SDK directly — both in `packages/chatbot/eslint.config.mjs`, since chatbot is the only package with these dependencies today.

`languageModel`/`createAgent` accept either a raw catalog id or a Model Role (`LANGUAGE_MODEL_ROLES` in `models`) — a named pointer to the id an internal, non-selectable feature (chat title, memory, meta-prompt, english workflows, compaction, …) currently uses, so retargeting one is a catalog edit, not a feature change; the user-selected Chat Modes keep resolving by id. `createAgent(idOrRole, { instructions, tools, overrides })` resolves through `languageModel`, wraps the model with tracing when `TRACE_ENABLED=1`, and returns a `ToolLoopAgent`. Speech is a separate small catalog (`SPEECH_MODELS`/`SPEECH_ROLES` in `models`, its own `SpeechProviderKind`) resolved via `speechModel(idOrRole)`; voice/speed/instructions stay call-time parameters in the feature (`lib/features/english/actions.ts`). The UI's own model config (invocable ids, per-model capabilities, the default model) is a separate, isomorphic module that depends only on `models` — `packages/chatbot/lib/features/foundation-model/config.ts` — so a client component never needs the kit at all.

### `chatbot` — Main Application

Full-stack Next.js 16 app (App Router). AI chatbot with multi-model support, RAG, coding agent integration, image editing, and project management.

### `coding-agent` — Worker Process

Separate HTTP worker that wraps `@earendil-works/pi-coding-agent`. Manages coding agent sessions, translates Pi events into AG-UI protocol events, and exposes an `/rpc` HTTP endpoint. The chatbot communicates with this worker to run coding tasks.

First-party extensions (the `subagent` tool and the `artifacts` tool) live under `packages/coding-agent/extensions/` and are handed to the SDK as `additionalExtensionPaths`, instead of being installed with `pi install` into the machine-wide `~/.pi/agent/settings.json`. See `packages/coding-agent/AGENTS.md`.

### `models` — Shared Catalog

Single source of truth for model definitions. `MODEL_CATALOG` drives the chatbot's model configurations, the chat/coding-agent model mapping, and the `models.json` the worker generates for Pi at startup. Adding a model means editing this catalog only.

The generated file is written to `CODING_AGENT_MODELS_JSON` (relative values resolve against `packages/coding-agent`, not the cwd). When unset it defaults to the worker-owned `.pi/agent/models.json`, never the machine-wide Pi config. `auth.json` stays global on purpose, so credentials are not duplicated per project.

### `tracing` — Shared Library

Reusable observability library used by both `chatbot` and `coding-agent`. Provides AI SDK middleware to capture LLM call traces (prompts, responses, tool calls, token usage) and writes them to disk as JSONL. Enabled via `TRACE_ENABLED=1`.

### Dependency Graph

```
chatbot ──→ coding-agent
   │              │
   ├──────────────┼──→ tracing
   ├──────────────┼──→ models
   └──────────────┴──→ inference ──→ { config, models }
```

`coding-agent → inference` is a real `package.json` dependency, but today it exists **only** to keep `packages/coding-agent/tests/contract/inference-import.test.ts` green (proof that the kit and `inference/testing` resolve and run from a plain tsx process, no Next.js involved) — the worker does not call the kit from any real code path yet.

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
