# Agent Instructions (Global — Monorepo Root)

## Package Manager

Use **pnpm** (workspace mode). Common root scripts:

- `pnpm dev` — start all services (chatbot + coding-agent)
- `pnpm build` — build the chatbot app
- `pnpm lint:fix` — lint all packages
- `pnpm test:unit` / `pnpm test:e2e` — unit & E2E tests
- `pnpm db:generate` / `pnpm db:migrate` — Drizzle ORM migrations

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
└── tracing/        # Shared tracing/observability library
tests/              # E2E tests (Playwright)
```

### `chatbot` — Main Application

Full-stack Next.js 16 app (App Router). AI chatbot with multi-model support, RAG, coding agent integration, image editing, and project management.

### `coding-agent` — Worker Process

Separate HTTP worker that wraps `@earendil-works/pi-coding-agent`. Manages coding agent sessions, translates Pi events into AG-UI protocol events, and exposes an `/rpc` HTTP endpoint. The chatbot communicates with this worker to run coding tasks.

### `tracing` — Shared Library

Reusable observability library used by both `chatbot` and `coding-agent`. Provides AI SDK middleware to capture LLM call traces (prompts, responses, tool calls, token usage) and writes them to disk as JSONL. Enabled via `TRACE_ENABLED=1`.

### Dependency Graph

```
chatbot ──→ coding-agent ──→ tracing
   └──────────────────────→ tracing
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
