# Agent Instructions (Global — Monorepo Root)

## Language

Everything in this repo is written in English — code, prompts and harness files alike.

- **Code**: identifiers, comments, JSDoc, log and error messages, test names, fixtures,
  commit messages.
- **Prompts**: system prompts, `.prompty` templates, chat-mode prompts, eval cases.
- **Harness**: `AGENTS.md`, `CONTEXT.md`, `docs/agents/`, skills, ADRs.

**Native-language exception**: issue specs and tickets under `.scratch/` may be written
in the operator's native language (Spanish). They are the operator's working documents;
the operator is their only human reader, and agents read them in either language.

**Legacy ADRs**: ADRs 0001–0011 are in Spanish; leave them as-is. Translate an existing
ADR to English only when you edit it for another reason. New ADRs are written in English.

**Canonical terms**: the glossary in `CONTEXT.md` records domain terms in English only.
When the operator discusses the domain in Spanish, map their words to the canonical
English term (`entorno` → `Environment`, `chat de prueba` → `Test Chat`); never register
Spanish aliases in the glossary.

Rename Spanish names to English when you touch a file (`environment` used to be
`entorno`), and translate Spanish comments you find in your way. Two things stay as they
are: user-facing localised copy, and prompt fixtures whose whole point is demonstrating
that the model answers in the user's language.

## Production is LIVE — guardrails (approval-first)

This machine runs a live Production service supervised by pm2: app `ai-chatbot` (root,
`pnpm preview`, typed prod configuration) → chatbot `:8085`, worker `:3015`,
postgres-prod `:5435`.

- **FORBIDDEN without the operator's explicit approval for each action**: any command
  that impacts that execution — `pm2 restart|reload|stop|delete|save`, `pnpm preview`,
  prod `build`, `docker compose … prod down`, or killing processes on 8085/3015/5435.
  When asking for approval, state the downtime window (a `preview` restart takes ~1–2 min
  because of the rebuild).
- Compilation checks that don't touch prod: `type:check`, `lint` and each package's test
  suites. To prove that prod compiles without overwriting the artifacts pm2 serves, the
  agent **always runs `build:verify`** (root: `pnpm build:verify`; or per package
  `pnpm --filter chatbot build:verify` + `pnpm --filter coding-agent build:verify`) — it
  writes to isolated, gitignored, disposable directories `.next/verify` / `dist/verify` /
  `.pi-verify`.
  **NEVER `build`** — it overwrites prod's `.next`/`dist`/`.pi-prod/models.json` under
  pm2 and would break the running execution; it is reserved for operator/CI with
  `ALLOW_PROD_BUILD=1` (see `build` in each package).
- Transition note (ADR 0011): the definition stored in pm2 still registers
  `env_file: .env.prod`, a file that no longer exists. The live process doesn't read it
  (the config is typed and `preview` uses `--env=prod`); `ecosystem.config.js` no longer
  declares it. If a controlled restart complains about the file, use
  `pm2 start ecosystem.config.js` and `pm2 save` **with the operator's approval**.
- Verifying the real service: read-only commands only — `pm2 ls`, `pm2 logs --nostream`,
  `curl` (GET to chatbot 8085; **NEVER `POST /rpc` to worker 3015** — a malformed body
  crashed the worker on 2026-09-02; for the worker only `ss -tlnp`/logs), `ss -tlnp`.
- Dev/test iteration: `pnpm dev` with its DBs (5433 dev / 5434 test), never with pm2. To
  stop safely **always go by port** — `pnpm stop:dev` (kills `3000`+`3016`) and
  `pnpm stop:test` (kills `3001`), or per package `pnpm --filter chatbot stop:dev` /
  `pnpm --filter coding-agent stop:dev` (they use `lsof -ti:PORT | xargs -r kill`).
  **Never `pkill -f "tsx ..."`** — `dev` and `prod` share the same
  `tsx src/transports/http.ts` and you would kill the prod worker (`3015`) inside
  `preview`'s `concurrently` (`8085` goes down even though `pm2 ls` still says `online`).

## Package Manager

Use **Node.js 24** and **pnpm 11** (workspace mode). Common root scripts (for the agent):

- `pnpm dev` — start all services (chatbot + coding-agent) in the Development Environment
  (`--env=dev`: 3000+3016, pg 5433)
- `pnpm stop:dev` — kills `3000`+`3016` by port (`lsof -ti:PORT | xargs -r kill`); `pnpm stop:test` — kills `3001` (+ `docker compose -f docker-compose.test.yml down`). Per package: `pnpm --filter chatbot stop:dev` (3000) / `stop:test` (3001); `pnpm --filter coding-agent stop:dev` (3016)
- `pnpm build:verify` — isolated compilation check (`.next/verify` + `dist/verify` + `.pi-verify`); **the agent's only way to check compilation without touching prod**
- `pnpm verify:fast` — lint, type-check, and run unit/component/integration/contract tests (the self-contained default profile: MSW + PGlite, no PostgreSQL container and no provisioned server)
- `pnpm test:infra` — the explicit infrastructure profile: the tests that need a provisioned resource (today the Mock Model Gateway harness test, which binds the canonical `:4001`)
- `pnpm verify:full` — lint, type-check, default profile, infra profile, Model Gateway suite, Playwright E2E, and `build:verify`; test selection lives in `packages/chatbot/vitest.config.ts` (`INFRA_TESTS`) and `vitest.infra.config.ts`, never in environment variables (ADR 0011)
- `pnpm lint:fix` — lint all packages
- `pnpm type:check` — check TypeScript types across all packages
- `pnpm test:unit` / `pnpm test:component` / `pnpm test:integration` / `pnpm test:contract` — fast test suites
- `pnpm test:gateway` — Model Gateway tests (`python3 -m pytest packages/model-gateway/tests -q`)
- `pnpm test:e2e` — Playwright E2E tests (Test Environment `--env=test`: pg 5434, worker stub, Mock Gateway `:4001`)
- Execution profiles, resources and scope: [`packages/chatbot/tests/AGENTS.md`](packages/chatbot/tests/AGENTS.md#execution-profiles) (policy in [ADR 0013](docs/adr/0013-model-gateway-testing-and-social-unit-tests.md)); substituted doubles and where their guarantees live: [`docs/model-gateway-testing-migration.md`](docs/model-gateway-testing-migration.md)
- `pnpm db:generate` / `pnpm db:push` — Drizzle ORM schema
- `pnpm db:dev:*` / `db:test:*` / `db:seed:*` — DB management and seeds for the Dev (5433) and Test (5434) Environments

Test ownership follows package ownership. Within each package, keep pure logic
and social unit tests (exercising concrete feature modules with PGlite for
persistence and MSW at the Model Gateway HTTP seam; see ADR 0013) under
`tests/unit`, rendered UI under `tests/component`, multi-module or
in-process infrastructure checks under `tests/integration`, and public package
boundary checks under `tests/contract`. Repository-level Playwright scenarios
remain under `tests/` (or package E2E suites) for guarantees that require the
deployed application.

## Browser verification (dev)

To verify UI work live, use the **agent-browser** skill (navigation, login,
screenshots): follow its instructions.

- **App with a session**: this app authenticates by cookies/session. Always define an isolated browser session so cookies survive the login:
  ```bash
  export AGENT_BROWSER_SESSION="$(agent-browser session id --scope worktree --prefix dev)"
  ```
- **Linux without a sandbox**: Chromium requires the `--no-sandbox` flag. Always add it when opening the browser:
  ```bash
  agent-browser --args "--no-sandbox" open http://localhost:3000/login
  ```

Sequence to bring up the Development Environment:

1. Model Gateway (prerequisite, serves `:4000` via systemd): `curl -fsS
   http://127.0.0.1:4000/health/liveliness` (expects `"I'm alive!"`; **do not use
   `GET /health`**, it answers 500). If it fails, check `systemctl status
   model-gateway.service` and its logs; without the Gateway the chat doesn't work.
2. Dev DB: `pnpm db:dev:start` (Postgres `5433`), plus `pnpm db:dev:migrate` if the
   schema changed.
3. Test data: `pnpm db:seed:dev` — seeds the test user and 5 sample chats so the UI
   isn't empty.
4. Services: `pnpm dev` → app on `http://localhost:3000`, worker `:3016`.
5. Login at `/login`: `test@test.com` / `123456` (live credentials from
   `packages/chatbot/scripts/seed-test-data.ts`).
6. When done: `pnpm stop:dev` (never `pkill`, see the guardrails above).

- **Never point the browser at prod** (`:8085`): that is real traffic on the live
  service. Browser verification goes against `localhost:3000`.
- If only worker code changed (`coding-agent`), you don't need to do anything by hand:
  the dev worker reloads; to kill it by port use only
  `pnpm --filter coding-agent stop:dev`.

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
├── model-gateway/  # Model Gateway (stateless LiteLLM Proxy); the only AI provider
├── config/         # Typed per-Environment configuration (TS, no process.env)
└── tracing/        # Shared tracing/observability library
tests/              # E2E tests (Playwright)
```

### `config` — Typed per-Environment configuration (ADR 0011)

**There are no `.env.*` files and no environment-variable selectors.** Configuration is
TypeScript modules with compile-time validation:

- `src/types.ts` — `Environment = "prod" | "dev" | "test"`, `StructuralConfig`,
  `SecretsConfig`, `AppConfig = Readonly<StructuralConfig & SecretsConfig>`.
- `src/config.{prod,dev,test}.ts` — versioned structural configuration (`satisfies
  StructuralConfig`), with portable paths via `repoPath()`/`packagePath()` (`src/paths.ts`
  discovers `REPO_ROOT` from `import.meta.url` up to `pnpm-workspace.yaml`). The historic
  prod exception (`codingAgentSessionsDir`, `codingAgentProjectsRoot`) keeps ADR 0002's
  live values.
- `src/secrets.{prod,dev}.ts` — real secrets, **gitignored**, imported statically: if they
  are missing, `tsc` and the bundler fail at compile time (never at runtime).
  `src/secrets.test.ts` (fake, versioned) and `src/secrets.example.ts` (template).
- `src/env.{prod,dev,test}.ts` — frozen bundle (`Object.freeze`) `config.<env>` +
  `secrets.<env>`, validated by `src/guardrails.ts` (Environment↔DSN↔Gateway port).
  Re-exports `src/surface.ts` (types, Gateway contract constants, paths, `optional`) so
  the bundler alias keeps the full API.
- `src/config.ts` — selector + `config` facade (`config.postgresUrl()`,
  `config.environment()`, …) over the active bundle. Resolution order:
  `initConfig(environment)` → `--env=prod|dev|test` in `process.argv` → runner detection
  (`vitest`/`@playwright/test`) → fail-fast `ConfigError`.

**Environment selection:**

- `coding-agent`, migrations, seeds and `mcp-server` require `--env=prod|dev|test` in
  `process.argv`. `process.argv` belongs only to the invoked process: the kernel doesn't
  clone it in `fork()`/`execve()`, so a subprocess spawned by the worker (e.g.
  `pnpm test`) never inherits the parent's Environment (ADR 0011 incident).
- `vitest.config.ts` / `playwright.config.mts` call `initConfig("test")` when they load
  and alias `"config"` to `packages/config/src/env.test.ts`.
- `chatbot` uses the micro-launcher `packages/chatbot/scripts/next-cli.ts` (the `next` CLI
  rejects unknown flags and `next dev` doesn't forward `argv` to the server). The
  launcher calls `initConfig()` in the same process and `next.config.ts` pins
  `turbopack.resolveAlias` + `webpack.resolve.alias` of `"config"` to the Environment's
  bundle. Tradeoff: it imports `next/dist/server/lib/start-server` and
  `next/dist/cli/next-build` (internal APIs) — when bumping Next's major, re-check the
  signatures (contract in `tests/contract/next-internals.test.ts`).

**Hard rules:**

- In any package's `src/`, configuration never reads `process.env`. The `NEXT_PUBLIC_*`
  variables no longer exist.
- Never reintroduce an environment-variable Environment selector or an `.env` loader: any
  subprocess would inherit the parent's Environment.
- `coding-agent` tests: mutating `process.env.CODING_AGENT_*` /
  `process.env.MODEL_GATEWAY_*` is forbidden. Use `createTestWorkerContext()`
  (`packages/coding-agent/tests/helpers/test-context.ts`) and inject the sandbox (writing
  to `.pi-prod`/`.pi-dev` is forbidden); contract in
  `tests/contract/no-process-env-mutations.test.ts`.

### `model-gateway` — Model Gateway (the only AI provider)

Service `packages/model-gateway`, decoupled from the monorepo (no workspace dependencies;
extractable with `mv` + `git init`): a **stateless LiteLLM Proxy** (`config.yaml`, no DB)
wrapped in a FastAPI micro-entrypoint (`server.py`), deployed as a systemd unit
(`model-gateway.service`, `:4000`). See `packages/model-gateway/README.md`.

- **Only AI provider** for chatbot and coding-agent: the repo holds no external provider
  keys (`OPENAI_API_KEY`, `OPENROUTER_API_KEY`, …) — they are custodied encrypted on the
  host with **`systemd-creds`** (`LoadCredentialEncrypted=`), managed by
  `packages/model-gateway/scripts/manage-creds.sh`.
- **Runtime catalog**: `GET ${MODEL_GATEWAY_URL}/v1/models/catalog` (bearer
  `MODEL_GATEWAY_API_KEY`) filters `user_invocable: true` entries server-side and returns
  the clean metadata schema. `chatbot` consumes it for the Model Picker and
  `<ModelCatalogProvider>`; `coding-agent` consumes it on startup to write Pi's
  `models.json` with a single `model-gateway` provider.
- **Default Model Contracts**: internal, non-selectable uses call the stable names the
  Gateway guarantees — `fast-default`, `flash-default`, `vision-default`,
  `reasoning-default`, `free-default`, `image-default`, `embedding-default`,
  `rerank-default`, `decision-default`, `tts-default` — with no static typed catalog.
- **Mock Model Gateway & testing toolkit** (ADR 0010, ADR 0013): `config.test.ts` pins
  `modelGatewayUrl` to `http://127.0.0.1:4001` (guarded by `packages/config/src/guardrails.ts`).
  Tests substitute the Gateway at its HTTP seam (MSW handlers in social unit tests; the
  `:4001` HTTP server in E2E and cross-process tests) using the official Gateway testing
  toolkit (`packages/model-gateway/js/` once extracted from `packages/chatbot/tests/mocks/gateway/`),
  while test capability catalogs and application scenarios remain owned by each consumer.
- **Chatbot facade**: `packages/chatbot/lib/infrastructure/ai/inference-kit.ts` is the
  composition root (`inferenceKit`, `speechModel`), a single OpenAI-compatible client
  against `${MODEL_GATEWAY_URL}/v1`. No `isTestMode()`: in test it also speaks HTTP to
  `:4001` (intercepted in-process via MSW or served by the Mock Gateway). Concrete
  features call `inferenceKit` directly without AI injection ports created solely for
  test doubles (ADR 0013). Isomorphic types and pure catalog helpers live in
  `packages/chatbot/lib/features/foundation-model/config.ts`, hydrated to the client via
  `<ModelCatalogProvider>` (`app/(chat)/layout.tsx`) — `"use client"` files never import
  the kit.
- **Lint boundaries** (`packages/chatbot/eslint.config.mjs`): a file with `"use client"`
  cannot import `@/lib/infrastructure/ai` (exact or any subpath), and no file outside
  `packages/chatbot/lib/infrastructure/ai/` may import `@ai-sdk/*` except `@ai-sdk/react`
  (UI). Both rules have contracts in
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
   ├──────────────┼──→ model-gateway (HTTP: Model Gateway / Mock Gateway in test)
   └──────────────┼──→ config
                  └
```

The workspace's Node packages are `chatbot`, `coding-agent`, `config` and `tracing`; the
Model Gateway Python service lives in `packages/model-gateway` for code co-location and
is deliberately **independent of the workspace at runtime** (no Node or `workspace:*`
dependencies to run the Python service): the only production interface between the TS
packages and it is HTTP (`MODEL_GATEWAY_URL`/`MODEL_GATEWAY_API_KEY` from `config`), and
the `*-default` names are plain-text contracts, not imports. For testing only,
`packages/model-gateway` provides an official JS protocol testing toolkit (ADR 0013)
consumed as a test dependency by `chatbot` and `coding-agent`.

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

Catalog pruning (2026-09-11): `.agents/skills/` went from 40 to 28 skills. Removed
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
