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
- For compilation checks, use `pnpm build:verify` (root or per package). It writes to
  isolated, gitignored directories and never overwrites the artifacts pm2 serves.
  **NEVER `build`** — it is reserved for operator/CI with `ALLOW_PROD_BUILD=1`.
- Verify the real service with read-only commands only: `pm2 ls`,
  `pm2 logs --nostream`, GET requests to chatbot `:8085`, and `ss -tlnp`. For the worker,
  use only `ss -tlnp` and logs; never send requests to its `/rpc` endpoint.
- Iterate with `pnpm dev`, never pm2. Stop services by port with `pnpm stop:dev`
  (3000+3016) or `pnpm stop:test` (3001); package-specific stop scripts are also
  available. **Never `pkill -f "tsx ..."`** — dev and prod share the same command line,
  so this can kill the production worker.

## Package Manager and Verification

Use **Node.js 24** and **pnpm 11** (workspace mode). `package.json` is the catalog of
available scripts. Choose verification by scope:

- **Focused iteration**: run the affected package suite or test file, for example
  `pnpm --filter chatbot test:unit tests/unit/chat/resume/registry.test.ts`.
- **Normal code changes**: `pnpm verify:fast` runs lint, type-checking and the
  self-contained unit suites, then inspects an existing verified client bundle. If that
  bundle is absent, inspection prints `NOT INSPECTED` and exits 0; this is not a passing
  bundle inspection.
- **Build, configuration or dependency changes**: also run `pnpm build:verify`.
- **Release-critical or cross-stack changes**: `pnpm verify:full` adds infrastructure
  tests, Playwright E2E and mandatory fresh bundle verification.

`pnpm test:unit` covers every workspace package plus the Model Gateway Python suite
without provisioned infrastructure. `pnpm test:infra` is the explicit profile for tests
that require a provisioned resource. `pnpm test:e2e` runs Playwright in the Test
Environment (PostgreSQL `:5434`, worker stub, Mock Gateway `:4001`). See
[`packages/chatbot/tests/AGENTS.md`](packages/chatbot/tests/AGENTS.md#execution-profiles)
for execution profiles and resource ownership.

Database scripts are grouped as `pnpm db:dev:*`, `pnpm db:test:*` and `pnpm db:seed:*`;
use `pnpm db:generate` / `pnpm db:push` for Drizzle schema workflows.

Each package has **unit** tests under `tests/unit/` and, where a real browser is
essential, **E2E** tests under `packages/chatbot/tests/e2e/`. Contract checks,
rendered-component tests without a browser and multi-module tests are unit tests.
Execution profiles change how tests run, never their category (ADR 0013).

## Browser verification (dev)

Use the **agent-browser** skill for live UI verification and follow its instructions.
Define an isolated session so cookies survive login, and use `--no-sandbox` on Linux:

```bash
export AGENT_BROWSER_SESSION="$(agent-browser session id --scope worktree --prefix dev)"
agent-browser --args "--no-sandbox" open http://localhost:3000/login
```

To bring up the Development Environment:

1. Check the Model Gateway on `:4000` with
   `curl -fsS http://127.0.0.1:4000/health/liveliness` (expects `"I'm alive!"`; do not
   use `GET /health`). If needed, inspect `model-gateway.service` with systemctl.
2. Start PostgreSQL with `pnpm db:dev:start`; run `pnpm db:dev:migrate` if the schema
   changed.
3. Run `pnpm db:seed:dev` for the test user and sample chats.
4. Start services with `pnpm dev` → app `http://localhost:3000`, worker `:3016`.
5. Log in at `/login` with the seeded credentials `test@test.com` / `123456`.
6. When done, use `pnpm stop:dev`.

Never point browser verification at production `:8085`. Worker-only changes reload in
dev; use `pnpm --filter coding-agent stop:dev` when a manual stop is necessary.

## Commit Attribution

AI commits MUST include a trailer with the active model's actual name:

```
Co-Authored-By: <active agent model name>
```

## Monorepo Structure

```
packages/
├── chatbot/        # Main Next.js web application
├── coding-agent/   # Coding agent HTTP worker
├── model-gateway/  # Model Gateway (stateless LiteLLM Proxy); the only AI provider
├── config/         # Typed per-Environment configuration
└── tracing/        # Shared tracing/observability library
```

### `config` — Typed per-Environment configuration (ADR 0011, ADR 0014)

Structural configuration lives in TypeScript bundles for `prod`, `dev` and `test`.
Production and development secrets come from the root `.env`, parsed into private memory
without mutating `process.env`; the Test Environment uses versioned fake credentials and
never reads that file. See ADR 0011 for Environment selection and ADR 0014 for secrets.

The active Environment is selected by explicit `initConfig(environment)`, the invoked
process's `--env=prod|dev|test` argument, or test-runner detection. The chatbot's Next
launcher initializes configuration and pins the bundler alias to the selected bundle.

Hard rules:

- Configuration in package `src/` never selects an Environment through environment
  variables. Loading `.env` must not populate `process.env` or expose secrets to child
  processes.
- Coding-agent tests inject configuration with `createTestWorkerContext()` and isolated
  sandboxes instead of mutating `process.env` or writing to `.pi-prod` / `.pi-dev`.

### `model-gateway` — Model Gateway (the only AI provider)

A stateless LiteLLM Proxy wrapped in a FastAPI entrypoint and deployed as a systemd
service on `:4000`. It custodies provider credentials and serves the runtime Model
Catalog. See [`packages/model-gateway/README.md`](packages/model-gateway/README.md) and
[`packages/model-gateway/CONTRACT.md`](packages/model-gateway/CONTRACT.md).

- Chatbot and coding-agent access AI models only through the Gateway. Selectable models
  come from `GET /v1/models/catalog`; internal uses rely on the stable `*-default`
  contracts rather than a static typed catalog.
- Tests substitute the Gateway at its HTTP seam with the official toolkit in
  `packages/model-gateway/js/` (MSW for unit tests, Mock Gateway `:4001` for E2E and
  cross-process tests). Test scenarios remain owned by each consumer (ADR 0013).
- Chatbot's server-side composition root is
  `packages/chatbot/lib/infrastructure/ai/inference-kit.ts`. Client files must not import
  the AI infrastructure; AI SDK imports outside that infrastructure are limited to
  `@ai-sdk/react` for UI. The ESLint configuration enforces both boundaries.

### `chatbot` — Main Application

Full-stack Next.js 16 app (App Router) with multi-model chat, RAG, coding-agent
integration, image editing and project management.

### `coding-agent` — Worker Process

HTTP worker wrapping `@earendil-works/pi-coding-agent`. It manages coding sessions,
translates Pi events into AG-UI events and exposes `/rpc` to the chatbot. First-party
extensions live under `packages/coding-agent/extensions/` and are passed to the SDK as
`additionalExtensionPaths`; see `packages/coding-agent/AGENTS.md`.

### `tracing` — Shared Library

Observability middleware for LLM calls, writing prompts, responses, tool calls and token
usage as JSONL. Activation and trace location come from `config.traceEnabled()` and
`config.traceDir()`.

### Dependency Graph

```
chatbot ──→ coding-agent
   │              │
   ├──────────────┼──→ tracing
   ├──────────────┼──→ model-gateway (HTTP: Model Gateway / Mock Gateway in test)
   └──────────────┼──→ config
                  └
```

The Model Gateway is independent of the Node workspace at runtime; its production
interface is HTTP. Its JS toolkit is consumed only as a test dependency.

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **CLI**: `codegraph explore "<symbol names or question>"` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature-slug>/`. See
`docs/agents/issue-tracker.md`.

### Triage labels

Uses the five canonical default labels (`needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See
`docs/agents/domain.md`.

### Vendored skills (local patches)

Skills under `.agents/skills/` are vendored and pinned by `skills-lock.json`. A re-sync
overwrites local edits, and patches intentionally leave the computed hash stale; keep
patches minimal and recorded here:

- `archify` (`SKILL.md`, `references/delivery-contract.md`): writes artifacts to the OS
  temp directory and publishes them via `publish_artifact({ path, name })`, returning the
  chatbot-relative artifact URL `/agent/code/<project>/<sessionId>/artifacts/<name>`.
- `improve-codebase-architecture` (`SKILL.md` §2, `HTML-REPORT.md`): publishes its HTML
  report through `publish_artifact({ path, name })` with a stable `name`, pins allowed CDN
  hosts and points at the first-party `mobile-first-artifacts` skill.
- `handoff` (`SKILL.md`): saves handoffs to the git-ignored `.handoffs/` directory with a
  `handoff-<topic>-<date>.md` name.
- `grilling` (`SKILL.md`): caps each round at 3 questions.
- `ask-matt` (`SKILL.md`): omits the `/to-questionnaire` entry because that skill is not
  vendored here.
