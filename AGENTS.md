# Agent Instructions (Global — Monorepo Root)

## Package Manager

Use **Node.js 24** and **pnpm 11** (workspace mode). Common root scripts:

- `pnpm dev` — start all services (chatbot + coding-agent)
- `pnpm build` — build the chatbot app
- `pnpm lint:fix` — lint all packages
- `pnpm verify:fast` — lint, type-check, and run unit/component/integration/contract tests
- `pnpm test:unit` / `pnpm test:component` / `pnpm test:integration` / `pnpm test:contract` — fast test suites
- `pnpm test:e2e` — Playwright E2E tests
- `pnpm db:generate` / `pnpm db:migrate` — Drizzle ORM migrations

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
├── model-registry/ # Single-source model catalog
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

### `chatbot` — Main Application

Full-stack Next.js 16 app (App Router). AI chatbot with multi-model support, RAG, coding agent integration, image editing, and project management.

### `coding-agent` — Worker Process

Separate HTTP worker that wraps `@earendil-works/pi-coding-agent`. Manages coding agent sessions, translates Pi events into AG-UI protocol events, and exposes an `/rpc` HTTP endpoint. The chatbot communicates with this worker to run coding tasks.

Pi packages (currently [superpowers](https://github.com/obra/superpowers)) are checked out into `packages/coding-agent/.pi/packages/` at a pinned ref before startup and handed to the SDK as `additionalExtensionPaths`, instead of being installed with `pi install` into the machine-wide `~/.pi/agent/settings.json`. See `packages/coding-agent/AGENTS.md`.

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
   └──────────────┴──→ models
```

<!-- context7 -->
Use the `ctx7` CLI to fetch current documentation whenever the user asks about a library, framework, SDK, API, CLI tool, or cloud service -- even well-known ones like React, Next.js, Prisma, Express, Tailwind, Django, or Spring Boot. This includes API syntax, configuration, version migration, library-specific debugging, setup instructions, and CLI tool usage. Use even when you think you know the answer -- your training data may not reflect recent changes. Prefer this over web search for library docs.

Do not use for: refactoring, writing scripts from scratch, debugging business logic, code review, or general programming concepts.

## Steps

1. Resolve library: `npx ctx7@latest library <name> "<user's question>"` — use the official library name with proper punctuation (e.g., "Next.js" not "nextjs", "Customer.io" not "customerio", "Three.js" not "threejs")
2. Pick the best match (ID format: `/org/project`) by: exact name match, description relevance, code snippet count, source reputation (High/Medium preferred), and benchmark score (higher is better). If results don't look right, try alternate names or queries (e.g., "next.js" not "nextjs", or rephrase the question)
3. Fetch docs: `npx ctx7@latest docs <libraryId> "<user's question>"`
4. Answer using the fetched documentation

You MUST call `library` first to get a valid ID unless the user provides one directly in `/org/project` format. Use the user's full question as the query -- specific and detailed queries return better results than vague single words. Do not run more than 3 commands per question. Do not include sensitive information (API keys, passwords, credentials) in queries.

For version-specific docs, use `/org/project/version` from the `library` output (e.g., `/vercel/next.js/v14.3.0`).

If a command fails with a quota error, inform the user and suggest `npx ctx7@latest login` or setting `CONTEXT7_API_KEY` env var for higher limits. Do not silently fall back to training data.
Run Context7 CLI requests outside Codex's default sandbox. If a Context7 CLI command fails with DNS or network errors such as ENOTFOUND, host resolution failures, or fetch failed, rerun it outside the sandbox instead of retrying inside the sandbox.
<!-- context7 -->

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->
