---
status: accepted
date: 2026-10-30
---

# Runtime `.env` secrets with in-memory parsing and decomposed Postgres coordinates

Amends the secrets mechanism of [ADR 0011](./0011-configuracion-tipada-por-entorno-y-seleccion-por-argv.md) while keeping its `process.argv` / bundler-alias Environment selection and test dependency-injection rules intact.

## Context

ADR 0011 placed credentials in gitignored TypeScript modules (`packages/config/src/secrets.prod.ts` and `secrets.dev.ts`) statically imported by `env.prod.ts` and `env.dev.ts` (and transitively by `config.ts`). In practice, that compile-time coupling broke isolated Git worktrees and agent workspaces where gitignored files do not exist:

1. `pnpm type:check` failed with `TS2307: Cannot find module './secrets.prod'`.
2. `pnpm test:e2e` failed at startup because `playwright.config.mts` imported `"config"`, which eagerly evaluated `env.prod.ts` and `env.dev.ts`.
3. `pnpm build:verify` (`--env=prod --verify`) failed to compile without `secrets.prod.ts`.
4. Storing the full `postgresUrl` inside `secrets.{prod,dev}.ts` mixed environment-specific topology (`localhost:5435/prod` vs `localhost:5433/dev`) with credentials (`user:password`), forcing separate secret files per Environment.
5. `CONTEXT7_API_KEY` had been omitted from `SecretsConfig`, leaving `Context7Agent` without an explicit API key once `.env` loading was removed.

## Decision

1. **Decompose database coordinates from database credentials**:
   - `StructuralConfig` (`config.{prod,dev,test}.ts`) owns `postgresHost`, `postgresPort`, and `postgresDatabase` (`localhost:5435/prod`, `localhost:5433/dev`, `127.0.0.1:5434/test`).
   - Only `POSTGRES_USER` (`postgresUser`) and `POSTGRES_PASSWORD` (`postgresPassword`) are secrets. `config.postgresUrl()` composes `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}` in code, making it structurally impossible for a secret to point one Environment at another Environment's database.

2. **Single root `.env` parsed in-memory (`util.parseEnv`), never mutating `process.env`**:
   - Because database host, port, and name are structural, all remaining infrastructure secrets are shared across `prod` and `dev` in a single gitignored `<REPO_ROOT>/.env` (with a versioned `<REPO_ROOT>/.env.example`):
     - Required in `prod` and `dev`: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `MODEL_GATEWAY_API_KEY`, `AUTH_SECRET`, `EXA_API_KEY`, `CONTEXT7_API_KEY`.
     - Optional client credential for the stdio Built-in MCP Server (`mcp-server/index.ts`): `MCP_API_KEY`.
   - `packages/config` reads `<REPO_ROOT>/.env` via `fs.readFileSync` and parses it into private module memory with Node's built-in `util.parseEnv` instead of `process.loadEnvFile()`. Secrets are **never** written into `process.env`, so child processes (`bash`, test runners, subagents) spawned by the Coding Agent Worker cannot inherit them through OS environment cloning.
   - `createContext7Agent` explicitly passes `apiKey: config.context7ApiKey()` to `new Context7Agent({ ... })`, and the redundant `exaSearchApiKey` alias is removed in favor of `config.exaApiKey()`.

3. **Hermetic `test` Environment and lazy secret resolution with `--verify` placeholders**:
   - The **Test Environment** (`--env=test`, `env.test.ts`) keeps deterministic fake credentials in versioned code and **never** reads `<REPO_ROOT>/.env` or `process.env`.
   - In `prod` and `dev`, structural configuration and `guardrails.ts` invariants (`5435/prod`, `5433/dev`, `5434/test`, `:4001`) are validated when the bundle loads, while `.env` secrets are resolved lazily on first secret-accessor call:
     - In normal `prod` or `dev` execution, missing `<REPO_ROOT>/.env` or any missing required key immediately throws `ConfigError`.
     - When `verifyBuild` is active (`pnpm build:verify` via `--verify` / `NEXT_CLI_VERIFY=1`) and `<REPO_ROOT>/.env` is absent, deterministic verification placeholders are used so fresh worktrees can run `pnpm type:check`, `pnpm test:unit`, `pnpm test:e2e`, `pnpm build:verify`, and `pnpm verify:full` without any gitignored files.
   - Client bundle inspection (`packages/chatbot/scripts/client-bundle.ts`) extracts secret literals to scan from `<REPO_ROOT>/.env` (when present) in addition to structural markers (`5435/prod`).

## Considered Options

- **Keep `secrets.{prod,dev}.ts` and generate dummy `.ts` files in CI/worktrees**: rejected because every new git worktree or subagent branch would still require a manual bootstrap step before `tsc`, `test:e2e`, or `build:verify` could run.
- **Load `.env` via `process.loadEnvFile()` into `process.env`**: rejected because mutating `process.env` re-exposes every secret to child processes spawned via `fork()`/`execve()` by the Coding Agent Worker's `bash` tool.
- **Separate `.env.prod` and `.env.dev` files**: unnecessary once `postgresHost`, `postgresPort`, and `postgresDatabase` move into `config.{prod,dev,test}.ts`.
