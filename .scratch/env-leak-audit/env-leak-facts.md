# Facts: how `.env.prod` can reach the dev/test runtimes

Scope: `/home/javier/projects/ai-chatbot` @ working tree (branch HEAD as of audit).
Rules respected: no code changes; **no secret value is printed** — key names, ports, hosts and lengths only.
Legend: `dev` = 3000 / worker 3016 / pg 5433 `/dev`; `prod` = 8085 / worker 3015 / pg 5435 `/prod`; `test` = 3001 / stub on 3001 / pg 5434 `/test`.

---

## 1. `pnpm dev` and the installed `dotenv-cli` semantics

Root script (exact):

- `package.json:7` — `"dev": "dotenv -e .env.dev -- pnpm --filter chatbot --filter coding-agent --parallel dev"`
- `package.json:10` — `"preview": "dotenv -o -e .env.prod -- pnpm --filter chatbot --filter coding-agent --parallel preview"`
- `package.json:38` — `"worker:dev": "dotenv -o -e .env.dev -- pnpm --filter coding-agent dev"`

Installed version:

- `node_modules/dotenv-cli -> .pnpm/dotenv-cli@11.0.0/node_modules/dotenv-cli` (symlink)
- `node_modules/.pnpm/dotenv-cli@11.0.0/node_modules/dotenv-cli/package.json:4` — `"version": "11.0.0"`
- `pnpm-lock.yaml:4216` — `dotenv-cli@11.0.0`
- Binaries present at root `node_modules/.bin/dotenv`, `packages/chatbot/node_modules/.bin/dotenv`, `packages/coding-agent/node_modules/.bin/dotenv`

Exact `-e` / `-o` / `--override` / `-c` semantics (installed source):

- `node_modules/dotenv-cli/cli.js:33` — `const override = argv.o || argv.override` → `undefined` unless `-o`/`--override` is passed.
- `node_modules/dotenv-cli/cli.js:88` — `dotenv.config({ path: path.resolve(env), override, quiet: isQuiet })` → with `override === undefined`, the underlying `dotenv` does **not** overwrite existing keys.
- `node_modules/dotenv-cli/cli.js:44-52` — `-e <path>` replaces the default `.env`; multiple `-e` allowed, each resolved from cwd.
- `node_modules/dotenv-cli/cli.js:38-41` — `-c` together with `-o` is rejected (`"Cascading env variables conflicts with overrides."`).
- `node_modules/dotenv-cli/cli.js:54-58` — `-c [env]` order: `${path}.${env}.local`, `${path}.local`, `${path}.${env}`, `${path}`.
- `node_modules/dotenv-cli/cli.js:114` — `spawn(command, argv._.slice(1), { stdio: 'inherit' })` → the child inherits the mutated `process.env` of the `dotenv` process.
- `node_modules/dotenv-cli/README.md:45` — "only sets variables if they haven't already been set. So the first one wins (existing env variables win over the first file and the first file wins over the second file)".
- `node_modules/dotenv-cli/README.md:190-193` — "Override … Override any environment variables that have already been set on your machine with values from your .env file."

**Default does not override.** `pnpm dev` (no `-o`) therefore keeps any pre-existing `POSTGRES_URL`, `PORT`, `NEXT_PUBLIC_ENV`, `NODE_ENV`, `CODING_AGENT_*`, … from the shell, and `.env.dev` only fills the gaps. `pnpm preview` and `pnpm worker:dev` *do* pass `-o`, so `.env.prod` / `.env.dev` win over the shell in those two paths.

`dotenv` (the library, used directly by scripts) resolves to `dotenv@16.6.1`:

- `packages/chatbot/node_modules/dotenv -> .pnpm/dotenv@16.6.1/node_modules/dotenv`
- `node_modules/.pnpm/dotenv@16.6.1/node_modules/dotenv/lib/main.js:338-348` — `populate(processEnv, parsed, options = {})`; `const override = Boolean(options && options.override)`; a key present in `processEnv` is only written when `override === true`.

---

## 2. What loads env files at runtime (config package + call sites)

`config` package — pure reader, **no file loading**:

- `packages/config/src/source.ts:13-15` — `readEnv(name)` → `process.env[name]`; `:18-20` `resolveSecret(name)` → `readEnv(name)`.
- `packages/config/src/config.ts:8` — `const postgresUrlRaw = secret("POSTGRES_URL")`; `:44` — `postgresUrl: () => assertDbMatchesEntorno(postgresUrlRaw())` (lazy read per call).
- `packages/config/src/catalog.ts` — declarative specs only (`POSTGRES_URL` `secret:true` `:19`; `PORT` `:45`; `TRACE_DIR` `:48`; `CODING_AGENT_WORKER_URL` default `http://localhost:3015` `:32`; `CODING_AGENT_WORKER_PORT` default `3015` `:33`).
- `packages/config/src/guardrails.ts:21-25` — `ENTORNO_DB = { test: "5434/test", dev: "5433/dev", prod: "5435/prod" }`; `:31-32` — if `NEXT_PUBLIC_ENV` is empty/unknown, the URL is returned **unchanged** (no cross-check).
- Search result: **no `process.loadEnvFile` anywhere** in the repo (`grep -rn "loadEnvFile"` excluding `node_modules`/`.next` → 0 hits).

Runtime file loaders (all keyed on `resolveEnvFile()`):

- `packages/chatbot/lib/infrastructure/env-file.ts:26-33` — `resolveEnvFile()`: `NEXT_PUBLIC_ENV === "test" → .env.test` (`:29`), `"evals" → .env.evals` (`:30`), `"prod" → .env.prod` (`:31`), otherwise `.env.dev` (`:32`). Anchored to repo root, not cwd (`:4-14`).
- `packages/chatbot/lib/infrastructure/db/migrate.ts:8` — `loadEnv({ path: resolveEnvFile() })` (no `override`).
- `packages/chatbot/drizzle.config.ts:8` — `loadEnv({ path: resolveEnvFile() })` (no `override`).
- `packages/chatbot/scripts/seed-test-data.ts:121` — `loadEnv({ path: resolveEnvFile() })` (no `override`).
- `packages/chatbot/scripts/eval-runner.ts:49` — `dotenv({ path: resolveEnvFile(), override: false })`, then explicit test overrides via `Object.assign` (`:50-69`, incl. `POSTGRES_URL: TEST_DB_URL`, `NEXT_PUBLIC_ENV: "evals"`).
- `packages/chatbot/tests/evals/cases/compaction.eval.ts:20-23` — `config({ path: resolve(__dirname, "../../../.env.development.local") })`, then `.env.development`, `.env.local`, `.env`. `__dirname` = `packages/chatbot/tests/evals/cases`, so all four resolve **inside `packages/chatbot/`** (verified: `../../../.env.development.local` → `/home/javier/projects/ai-chatbot/packages/chatbot/.env.development.local`). No `override` → ambient wins.
- `packages/chatbot/playwright.config.ts:11-16` — `loadEnv({ path: <repo>/.env.test, override: true })` — the only loader that forces its file over the shell.

Consequence: **anything that reads `NEXT_PUBLIC_ENV` from the ambient shell and calls `resolveEnvFile()` will load `.env.prod`**. That is reachable from non-prod-intent commands because `db:generate` / `db:push` (`packages/chatbot/package.json:15-16`, root `package.json:13-14`) run `drizzle-kit` with no `dotenv -o -e …` wrapper, so `drizzle.config.ts:8` decides the file from the ambient `NEXT_PUBLIC_ENV`; the same is true of `migrate.ts` / `seed-test-data.ts` / `eval-runner.ts` when invoked outside their wrapped scripts.

Test runners load no env file at all:

- `packages/chatbot/vitest.config.ts:11-17` — only `env: { NODE_ENV: "test" }`; no dotenv.
- `packages/coding-agent/vitest.config.ts:4-8` — same.
- `packages/chatbot/package.json:41-45` — `test:unit|component|integration|contract` set only `NODE_ENV=test`.
  → these suites inherit the ambient environment verbatim.

---

## 3. `packages/chatbot/.env.development.local` (and the root copy)

Files:

- `packages/chatbot/.env.development.local` — exists, mtime `2026-09-02T18:05:27Z`, 4048 bytes.
- `.env.development.local` (repo root) — exists, mtime `2026-09-02T18:05:24Z`, 4048 bytes.
- `md5sum` of both = `a0adb488b5dda21219a7657939f8aaa3` → **byte-identical**.
- Same minute as `.env.prod` mtime (`2026-09-02T18:05:27Z`).
- Gitignored, not tracked: `.gitignore:42` (`.env*.local`) matches the root file; `packages/chatbot/.gitignore:41` (`.env*.local`) matches the `packages/chatbot` one. `git ls-files | grep '^\.env'` → only `.env.example` and `.env.test`.

Keys (49) — names only: `ANTHROPIC_API_KEY, AUTH_SECRET, AUTH_TRUST_HOST, DATABASE_URL, DATABASE_URL_UNPOOLED, GOOGLE_GENERATIVE_AI_API_KEY, AI_GATEWAY_API_KEY, GROQ_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, DEEPINFRA_API_KEY, PERPLEXITY_API_KEY, META_API_KEY, DEEPSEEK_API_KEY, COHERE_API_KEY, OPENCODE_ZEN_API_KEY, OPENCODE_API_KEY, OLLAMA_HOST, EXA_API_KEY, CONTEXT7_API_KEY, PGDATABASE, PGHOST, PGHOST_UNPOOLED, PGPASSWORD, PGUSER, POSTGRES_DATABASE, POSTGRES_HOST, POSTGRES_PASSWORD, POSTGRES_PRISMA_URL, POSTGRES_URL, POSTGRES_URL_NON_POOLING, POSTGRES_URL_NO_SSL, POSTGRES_USER, PRIVATE_BEHAVIOR, VERCEL_OIDC_TOKEN, XAI_API_KEY, BLOB_READ_WRITE_TOKEN, RAG_UPLOAD_LIMIT, DEBUG_CHUNKING, CODING_AGENT_ENABLED, CODING_AGENT_PROJECTS_ROOT, CODING_AGENT_SESSIONS_DIR, CODING_AGENT_WORKER_URL, CODING_AGENT_WORKER_PORT, CODING_AGENT_ARTIFACTS_URL, CODING_AGENT_AUTH_JSON, CODING_AGENT_MODELS_JSON, TRACE_ENABLED, TRACE_RAW`.

Requested values (credentials masked; ports/hosts shown):

| key | value |
| --- | --- |
| `NEXT_PUBLIC_ENV` | **absent** |
| `PORT` | **absent** |
| `POSTGRES_URL` / `DATABASE_URL` / `POSTGRES_PRISMA_URL` / `POSTGRES_URL_NON_POOLING` / `POSTGRES_URL_NO_SSL` | `localhost:5433` path `/main` (credentials masked) |
| `PGHOST` / `POSTGRES_HOST` / `PGHOST_UNPOOLED` | `localhost` |
| `CODING_AGENT_WORKER_PORT` | `3015` |
| `CODING_AGENT_WORKER_URL` | `http://localhost:3015/` |
| `CODING_AGENT_ARTIFACTS_URL` | `http://192.168.18.50:3015/` |
| `CODING_AGENT_MODELS_JSON` | `.pi/models.json` |
| `CODING_AGENT_SESSIONS_DIR` | `/home/javier/coding-agent/sessions` |
| `CODING_AGENT_PROJECTS_ROOT` | `/home/javier/projects` |

Reading vs. dev/prod:

- DB **port** 5433 = dev, but DB **name** `main` matches neither dev (`dev`) nor prod (`prod`) nor test (`test`).
- Coding-agent port 3015, worker URL and artifacts URL = **prod** values (dev uses 3016; test uses the stub on 3001).
- `CODING_AGENT_MODELS_JSON=.pi/models.json` matches neither dev (`.pi-dev/models.json`) nor prod (`.pi-prod/models.json`).
- Keys present **only** here (not in `.env.dev`, `.env.prod`, `.env.test`): `VERCEL_OIDC_TOKEN`, `BLOB_READ_WRITE_TOKEN`, `XAI_API_KEY` (Vercel-style pull markers); `DATABASE_URL_UNPOOLED`, `PGHOST_UNPOOLED`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_URL_NO_SSL` also come from that family.
- Value-level comparison (values not printed): 36/49 values are byte-identical to `.env.prod` (all provider keys, `AUTH_SECRET`, `PG*` credentials) and 32/49 byte-identical to `.env.dev`. Differing keys vs `.env.prod`: `DATABASE_URL, DATABASE_URL_UNPOOLED, PGDATABASE, POSTGRES_DATABASE, POSTGRES_PRISMA_URL, POSTGRES_URL, POSTGRES_URL_NON_POOLING, POSTGRES_URL_NO_SSL, CODING_AGENT_AUTH_JSON, CODING_AGENT_MODELS_JSON`. Differing keys vs `.env.dev`: those DB keys plus `CODING_AGENT_SESSIONS_DIR, CODING_AGENT_WORKER_URL, CODING_AGENT_WORKER_PORT, CODING_AGENT_ARTIFACTS_URL, CODING_AGENT_AUTH_JSON, CODING_AGENT_MODELS_JSON`.
- Net: a mixed/stale file — dev DB **port** with a non-repo DB name, prod coding-agent ports and prod session path, legacy `.pi/` models path.

Does `next dev` in `packages/chatbot` auto-load it? **Yes** (project-dir file, dev mode):

- `node_modules/.pnpm/next@16.1.1_…/node_modules/next/dist/bin/next:114` — dev command option `-p, --port <port>` `.default(3000).env('PORT')` (so ambient `PORT=8085` would be used as the dev port when not overridden by `-p`).
- `.../next/dist/cli/next-dev.js:158-160` — `nextDev = async (options, portSource, directory) => { … dir = getProjectDir(process.env.NEXT_PRIVATE_DEV_DIR || directory) … }`; `:191` `let port = options.port`.
- `.../next/dist/server/config.js:1129` — `loadEnvConfig(dir, phase === PHASE_DEVELOPMENT_SERVER, curLog)`.
- `node_modules/.pnpm/@next+env@16.1.1/node_modules/@next/env/dist/index.js:1` (single minified line; bundles `dotenv@16.3.1`) — `loadEnvConfig` builds `const f = ['.env.'+d+'.local', d!=='test' && '.env.local', '.env.'+d, '.env']` with `d = NODE_ENV==='test' ? 'test' : isDev ? 'development' : 'production'`. So `.env.development.local` **is** in the list for `next dev`.

Does `@next/env` override pre-existing `process.env` values? **No.**

- Same minified bundle, `populate`/`processEnv`: `if (Object.prototype.hasOwnProperty.call(e,n)) { if (o === true) e[n] = t[n] }` with `o = Boolean(n && n.override)`; and `processEnv()` only fills a key when `typeof loadedKeys[k] === "undefined" && typeof initialEnv[k] === "undefined"`, where `initialEnv` is the snapshot of `process.env` taken at module load.
- Empirical probe with the installed copy (`loadEnvConfig('/tmp/nextenv-probe', true, console)` with a file defining `PROBE_SHARED=from_development_local` and ambient `PROBE_SHARED=from_preexisting_env`): output `PROBE_SHARED = from_preexisting_env`, `PROBE_ONLY_LOCAL = file_only` → pre-existing wins, missing keys are filled.
- `@next/env` API surface: `node_modules/.pnpm/@next+env@16.1.1/node_modules/@next/env/dist/index.d.ts` (`loadEnvConfig(dir, dev?, log?, forceReload?, onReload?)`, `initialEnv`, `updateInitialEnv`, `resetEnv`).

Combined effect in this repo:

- `pnpm dev` = dotenv-cli `.env.dev` (no `-o`) → ambient wins over `.env.dev`; then `next dev` loads `packages/chatbot/.env.development.local` but cannot override anything already set. Because the file's key set ⊆ `.env.dev` keys ∪ {`BLOB_READ_WRITE_TOKEN`, `VERCEL_OIDC_TOKEN`, `XAI_API_KEY`}, only those three can originate from it under `pnpm dev`.
- A bare `next dev` in `packages/chatbot` (no dotenv-cli, clean shell) **does** get `POSTGRES_URL=localhost:5433/main` and `CODING_AGENT_WORKER_PORT=3015` from this file; with `NEXT_PUBLIC_ENV` unset the guardrail returns the URL unchanged (`packages/config/src/guardrails.ts:31-32`).

---

## 4. Ambient shell environment

Command run: `env | cut -d= -f1 | sort` → **153 keys**.

Keys of interest **present** in the current shell:
`AI_GATEWAY_API_KEY, ANTHROPIC_API_KEY, AUTH_SECRET, CODING_AGENT_AGENT_DIR, CODING_AGENT_ARTIFACTS_DIR, CODING_AGENT_ARTIFACTS_URL, CODING_AGENT_AUTH_JSON, CODING_AGENT_ENABLED, CODING_AGENT_MODELS_JSON, CODING_AGENT_PI_PACKAGES_DIR, CODING_AGENT_PROJECTS_ROOT, CODING_AGENT_SESSIONS_DIR, CODING_AGENT_WORKER_PORT, CODING_AGENT_WORKER_URL, DATABASE_URL, DATABASE_URL_UNPOOLED, DEEPINFRA_API_KEY, EXA_API_KEY, NEXT_PUBLIC_ENV, NODE_ENV, OPENAI_API_KEY, OPENCODE_API_KEY, OPENCODE_ZEN_API_KEY, PGDATABASE, PGHOST, PGHOST_UNPOOLED, PGPASSWORD, PGUSER, PORT, POSTGRES_DATABASE, POSTGRES_HOST, POSTGRES_PASSWORD, POSTGRES_PRISMA_URL, POSTGRES_URL, POSTGRES_URL_NON_POOLING, POSTGRES_URL_NO_SSL, POSTGRES_USER, TRACE_DIR, TRACE_ENABLED, TRACE_RAW`.

Not present: `VERCEL_OIDC_TOKEN`, `VERCEL_AI_GATEWAY_API_KEY`, `CODING_AGENT_WORKER_STUB` (n/a), `BLOB_READ_WRITE_TOKEN`, `XAI_API_KEY`.

Values (secrets masked, ports/hosts/paths shown):

| key | observed value |
| --- | --- |
| `NEXT_PUBLIC_ENV` | `prod` |
| `NODE_ENV` | `production` |
| `PORT` | `8085` |
| `POSTGRES_URL`, `DATABASE_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_URL_NO_SSL` | `postgres://localhost:5435/prod` (credentials masked) |
| `PGDATABASE` / `PGHOST` | `prod` / `localhost` |
| `CODING_AGENT_WORKER_PORT` | `3015` |
| `CODING_AGENT_WORKER_URL` | `http://localhost:3015/` |
| `CODING_AGENT_ARTIFACTS_URL` | `http://192.168.18.50:3015/` |
| `CODING_AGENT_MODELS_JSON` | `.pi-prod/models.json` |
| `CODING_AGENT_AGENT_DIR` | `.pi-prod/agent` |
| `CODING_AGENT_PI_PACKAGES_DIR` | `.pi-prod/packages` |
| `CODING_AGENT_ARTIFACTS_DIR` | `.pi-prod/artifacts` |
| `CODING_AGENT_SESSIONS_DIR` | `/home/javier/coding-agent/sessions` |
| `TRACE_DIR` | `/home/javier/projects/ai-chatbot/packages/coding-agent/.pi-prod/traces` |
| `TRACE_ENABLED` / `TRACE_RAW` | `1` / `1` |

→ The ambient environment is a **complete prod signature** (5435 `/prod`, 8085, 3015, `.pi-prod/*`), not dev.

How it got there (process ancestry of the audit shell):

```
bash (316208) ← node --import tsx dist/transports/http.js (191711)
             ← sh -c ALLOW_PROD_BUILD=1 pnpm run build && node --import tsx dist/transports/http.js (191259)
             ← node .../dotenv-cli/cli.js -o -e ../../.env.prod -- sh -c '…' (191239)
             ← pnpm --filter chatbot --filter coding-agent --parallel preview (191216)
             ← node .../dotenv-cli/cli.js -o -e .env.prod -- pnpm … preview (191204)
             ← sh -c dotenv -o -e .env.prod -- pnpm … preview (191203)
             ← node .../pnpm preview = pm2 app ai-chatbot (191108)
```

The prod worker process (`191711`) spawns every agent child shell, so every `bash -c` it launches inherits `.env.prod` values. Any dev/test command executed from such a shell sees prod `POSTGRES_URL`, `PORT`, `NEXT_PUBLIC_ENV`, `CODING_AGENT_*` unless the command itself forces them (only `pnpm preview` and `pnpm worker:dev` use `-o`).

Shell startup files / system sources:

- `~/.bashrc` (131 lines), `~/.profile` (34), `~/.zshrc` (129): **no** `dotenv`, **no** `source`/`.` of `.env*`, and **no** export of `POSTGRES_URL`, `DATABASE_URL`, `NEXT_PUBLIC_ENV`, `PORT`, `CODING_AGENT_*`, `TRACE_*`, `ANTHROPIC_API_KEY`, `AUTH_SECRET`.
- Exception found: `~/.bashrc:125` — `export VERCEL_AI_GATEWAY_API_KEY="…"` (a plaintext secret literal in a startup file; value masked).
- Absent: `~/.bash_profile`, `~/.bash_login`, `~/.zprofile`, `~/.zshenv`, `~/.pam_environment`, `~/.config/environment.d/`.
- `/etc/environment` → only `PATH="…"`.
- `systemctl --user show-environment` → `HOME, LANG, LOGNAME, PATH, SHELL, USER, XDG_RUNTIME_DIR, GTK_MODULES, QT_ACCESSIBILITY, XDG_DATA_DIRS, DBUS_SESSION_BUS_ADDRESS, GSM_SKIP_SSH_AGENT_WORKAROUND, SSH_AUTH_SOCK` — none of the audited keys.

---

## 5. pm2

`pm2 ls` (read-only): 7 apps, **all `user = javier`** (same OS user as dev/test; `whoami` = `javier`, `uid=1000`, groups include `docker`).
`ai-chatbot` → id 6, pid 191108, uptime 5h, restarts 8, `fork` mode, `online`.
Daemon: `PID 1795  PM2 v6.0.14: God Daemon (/home/javier/.pm2)`, user `javier`.

Saved dump `~/.pm2/dump.pm2` (mode `-rw-rw-r--`, owner `javier:javier`, 96133 bytes, mtime sep 3 00:34):

- App `ai-chatbot`: `env_file: ".env.prod"`, `cwd: "/home/javier/projects/ai-chatbot"`, `args: ["preview"]`, `pm_exec_path: "/home/javier/.nvm/versions/node/v24.14.0/bin/pnpm"`, `exec_interpreter: "none"`.
- It also stores a **full inline `env` snapshot of 112 keys** whose names include `POSTGRES_URL`, `POSTGRES_PASSWORD`, `POSTGRES_USER`, `DATABASE_URL`, `AUTH_SECRET`, `AI_GATEWAY_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `TRACE_DIR`, … i.e. prod **values are persisted in cleartext in the dump file** (readable by group and others given mode 664). Masked summary of that snapshot: `NEXT_PUBLIC_ENV=prod`, `NODE_ENV=production`, `PORT=8085`, `POSTGRES_URL=postgres://localhost:5435/prod`, `DATABASE_URL=postgres://localhost:5435/prod`, `CODING_AGENT_WORKER_PORT=3015`, `CODING_AGENT_WORKER_URL=http://localhost:3015/`, `TRACE_DIR=/home/javier/projects/ai-chatbot/packages/coding-agent/.pi-prod/traces`.
- No `env_file` at top level; the pattern is inline `env` + `env_file` on the app record.

Other apps in the same dump (relevant to cross-app leakage):

| app | cwd | env_file | masked highlights |
| --- | --- | --- | --- |
| `ai-chatbot` | `/home/javier/projects/ai-chatbot` | `.env.prod` | `NEXT_PUBLIC_ENV=prod`, `PORT=8085`, pg `5435/prod`, worker `3015` |
| `book-translator` | `/home/javier/projects/ai-chatbot` | `.env.development.local` | `NODE_ENV=production`, `PORT=8095`, `POSTGRES_URL=postgres://localhost:5433/main`, `CODING_AGENT_WORKER_PORT=3015`, `CODING_AGENT_WORKER_URL=http://localhost:3015/` + full secret set from that file |
| `job-agent` | (undefined) | `.env` | — |
| `sitemap-to-llm` | (undefined) | — | `NODE_ENV=production` |
| `llm-wiki` | `server` | — | `NODE_ENV=production`, `PORT=3005` |
| `open-design` | `/home/javier/open-design` | — | `NODE_ENV=production` |
| `markdown-editor` | (undefined) | — | inline `VERCEL_AI_GATEWAY_API_KEY` key present |

`book-translator` runs from a **different project's** entrypoint (`/home/javier/projects/book-translator/dist/server/entry.mjs`) but with `cwd` inside this repo and `env_file: .env.development.local`, hence it resolves to `/home/javier/projects/ai-chatbot/.env.development.local`.

`ecosystem.config.js:10-28` (the checked-in pm2 descriptor): single app `ai-chatbot`, `script: "pnpm"`, `args: "preview"`, `env_file: ".env.prod"` (`:22`), inline `env: { NODE_ENV: "production", PATH: process.env.PATH, PORT: "8085" }` (`:23-27`).

---

## 6. Anything that writes to a shared / machine-level env file

Command run:

```
grep -rn "loadEnvFile\|dotenv" --include=*.ts --include=*.mjs --include=*.js packages/ --exclude-dir=node_modules | head -50
```

Hits (all under `packages/`): `packages/chatbot/lib/infrastructure/db/migrate.ts:1`, `packages/chatbot/drizzle.config.ts:1`, `packages/chatbot/scripts/eval-runner.ts:12,49`, `packages/chatbot/scripts/seed-test-data.ts:2`, `packages/chatbot/playwright.config.ts:6,8`, `packages/chatbot/tests/unit/infrastructure/env.test.ts:15`, `packages/chatbot/tests/evals/cases/compaction.eval.ts:5,20`, `packages/config/src/config.ts:10` (comment), `packages/config/src/guardrails.ts:39` (message text).

Writers found:

- `packages/coding-agent/scripts/generate-models.ts:55-58` — `const target = getModelsJsonPath(); mkdirSync(dirname(target), …); writeFileSync(target, …)`.
- `packages/coding-agent/src/runtime/models.ts:5-10` — `getModelsJsonPath()` = `resolveOverride(config.codingAgentModelsJson(), path.join(getCodingAgentDir(), "models.json"))` (relative overrides anchored to the package).
- `packages/coding-agent/package.json:64` (`build`) and `:66` (`preview`) run that script **under `.env.prod`** → writes `packages/coding-agent/.pi-prod/models.json` (present: 6643 bytes, mtime `2026-09-11 13:03`).
- `packages/coding-agent/package.json:65` (`build:verify`) sets `CODING_AGENT_MODELS_JSON=.pi-verify/models.json` and does **not** load `.env.prod`.
- Legacy artifact also present: `packages/coding-agent/.pi/models.json` (9487 bytes, mtime `2026-09-03 08:58`) — the fallback path when `CODING_AGENT_MODELS_JSON` is unset.

Not found:

- No script copies, exports or symlinks `.env.prod` anywhere else; no `.sh` scripts in the repo other than `.husky/_/husky.sh`; no writes to `/etc`, `~/.config/environment.d`, `~/.pam_environment`, or the systemd user environment.
- No `process.loadEnvFile` usage (0 hits).
- `~/.pi/agent` is only mentioned in comments/tests (`packages/coding-agent/src/runtime/model-runtime.ts:17`, `src/runtime/models.ts:15`, `tests/unit/runtime-paths.test.ts:96,101`).

References to `.env.prod` / `.env.development.local` outside their own files (grep, excluding `node_modules`/`.next`/`.scratch`): `packages/chatbot/lib/infrastructure/env-file.ts:20-21,31`, `packages/chatbot/scripts/eval-runner.ts:48` (comment), `packages/chatbot/drizzle.config.ts:6` (comment), `packages/chatbot/package.json:10,11,12,25`, `packages/coding-agent/package.json:64,66`, `package.json:10`, `ecosystem.config.js:2,22`, plus contract/unit tests (`packages/chatbot/tests/contract/build-scripts.test.ts:23,57,64-96`, `packages/coding-agent/tests/contract/build-scripts.test.ts:41,52,69,78,86-88`, `packages/chatbot/tests/unit/infrastructure/env.test.ts:99,102,116,119`).

Runtime consumers of `.env.development.local`: `packages/chatbot/tests/evals/cases/compaction.eval.ts:20` and the pm2 `book-translator` app (dump). Nothing in repo scripts references the **root** copy.

---

## 7. Test runtime path

Scripts:

- `packages/chatbot/package.json:37` — `"test:e2e": "pnpm run db:test:start && playwright test $PLAYWRIGHT_ARGS"` (root `package.json:34` delegates).
- `packages/chatbot/package.json:19` — `"db:test:start": "docker compose -f ../../docker-compose.test.yml up --wait"`.

Playwright config (`packages/chatbot/playwright.config.ts`):

- `:11-16` — `loadEnv({ path: path.join(__dirname, "..", "..", ".env.test"), override: true })` — the only env-file load that overrides the shell.
- `:18` — `const PORT = config.port() ?? 3000;` → with `.env.test` `PORT=3001` the e2e server runs on 3001.
- `:27-28` — `globalSetup: ./tests/e2e/global-setup`, `globalTeardown: ./tests/e2e/global-teardown`.
- `:41` — `workers: 1`; `:100` — webServer `command: npx next dev --webpack -p ${PORT}`.
- `:109-121` — webServer `env`: `NODE_ENV: "development"` (`:112`), `DISABLE_DEV_INDICATOR: "1"`, `NEXT_PUBLIC_ENV: "test"` (`:114`), and `CODING_AGENT_ENABLED|PROJECTS_ROOT|SESSIONS_DIR|WORKER_URL|WORKER_PORT|AUTH_JSON` forwarded from `process.env` with `?? "true"` / `?? ""` fallbacks (`:115-120`). Because the config already loaded `.env.test` with `override: true`, those forwarded values are the test values (`WORKER_URL` = stub on 3001).

Worker in e2e: **stub, not the real worker.**

- `.env.test` — `CODING_AGENT_WORKER_URL="http://localhost:3001/api/agent/code/worker-stub"`; keys are `POSTGRES_URL (127.0.0.1:5434/test), PRIVATE_BEHAVIOR, AUTH_SECRET, EXA_API_KEY, DISABLE_DEV_INDICATOR, NEXT_PUBLIC_ENV="test", PORT=3001, CODING_AGENT_ENABLED, CODING_AGENT_PROJECTS_ROOT, CODING_AGENT_SESSIONS_DIR, CODING_AGENT_WORKER_URL, CODING_AGENT_AUTH_JSON, CODING_AGENT_MODELS_JSON, CODING_AGENT_AGENT_DIR, CODING_AGENT_PI_PACKAGES_DIR, CODING_AGENT_ARTIFACTS_DIR, TRACE_DIR`.
- `packages/chatbot/app/(chat)/api/agent/code/worker-stub/rpc/route.ts:18-21` — `POST` returns 404 unless `process.env.NEXT_PUBLIC_ENV === "test" || config.nodeEnv() === "test"`; stub model list follows (`:25-40`).
- `packages/coding-agent/package.json:68` — `"stop:test": "sh -c 'echo \"test uses stub on 3001, no worker dev to stop\"'"`.
- `packages/chatbot/tests/e2e/global-setup.ts:6-8` — hard-coded fallback URL `postgres://<user>:<password>@localhost:5434/test` (credentials match the literal ones in the compose files; masked here); `:37-42` throws unless the URL contains `5434/test`; `:44-56` waits for Postgres then runs drizzle migrations.
- `packages/chatbot/tests/e2e/global-teardown.ts:6-8,13` — resets the schema with `drizzle-seed`.
- Env file used: `.env.test` — **tracked in git** (`git ls-files` lists `.env.test`); not matched by any `.gitignore` rule.

Start/stop helpers:

- Root `package.json:11` — `"stop:dev": "pnpm --filter chatbot stop:dev && pnpm --filter coding-agent stop:dev"`; `:12` — `"stop:test"` similarly.
- `packages/chatbot/package.json:13` — `"stop:dev": "sh -c 'lsof -ti:3000 | xargs -r kill 2>/dev/null || true; …'"`; `:14` — `"stop:test": "sh -c 'lsof -ti:3001 | xargs -r kill …; docker compose -f ../../docker-compose.test.yml down …'"`.
- `packages/coding-agent/package.json:67` — `"stop:dev": "sh -c 'lsof -ti:3016 | xargs -r kill …'"`; `:68` — test no-op (above).
- Dev DB start: `packages/chatbot/package.json:17` — `docker compose -f ../../docker-compose.dev.yml up -d --wait`.

Root `tests/` directory: contains only generated eval traces (`tests/evals/traces/*.json`, `*.ndjson`) — no Playwright specs. All e2e specs live under `packages/chatbot/tests/e2e/` (`navigation.spec.ts`, `seed.spec.ts`, `chat/*.spec.ts`, `agent-code/*.spec.ts`, …). Root `.env.evals` does **not** exist even though `resolveEnvFile()` can return it (`env-file.ts:30`).

Unit/component/integration/contract: `packages/chatbot/package.json:41-45` and `packages/coding-agent/package.json:71-73` — no env file is loaded, only `NODE_ENV=test`; ambient values are inherited.

---

## 8. Docker availability and Dockerfiles

```
$ docker --version
Docker version 29.6.2, build dfc4efb
$ docker compose version
Docker Compose version v5.3.1
```

Dockerfiles: **none** in the repo (`find . -name "Dockerfile*" -not -path "*/node_modules/*" -not -path "./.git/*"` → 0 results).

Compose files (all Postgres-only, all with literal `POSTGRES_USER` / `POSTGRES_PASSWORD` values committed in the file — masked here):

| file | project name | image | host:container | POSTGRES_DB | volume |
| --- | --- | --- | --- | --- | --- |
| `docker-compose.dev.yml:1-21` | `ai-chatbot-dev` | `pgvector/pgvector:pg17` | `5433:5432` (`:10`) | `dev` (`:14`) | `pgdata-dev` (`:8,21`) |
| `docker-compose.test.yml:1-16` | `ai-chatbot-test` | `pgvector/pgvector:pg17` | `5434:5432` (`:8`) | `test` (`:12`) | none |
| `docker-compose.prod.yml:1-21` | `ai-chatbot-prod` | `pgvector/pgvector:pg17` | `5435:5432` (`:10`) | `prod` (`:14`) | `pgdata-prod` (`:8,21`) |

Each service defines a `pg_isready -U postgres` healthcheck (10s interval / 5s timeout / 5 retries) and `command: '-d 1'`.

---

## Summary of concrete leak paths (facts only)

1. **Ambient prod env in agent shells.** The prod `pnpm preview` pipeline (`dotenv -o -e .env.prod`, pm2 pid 191108) is an ancestor of the current shell; its exported values (pg `5435/prod`, `PORT=8085`, `NEXT_PUBLIC_ENV=prod`, worker `3015`, `.pi-prod/*`) reach every child command. Verified by process ancestry and by `env`.
2. **`pnpm dev` does not override ambient values.** `package.json:7` lacks `-o`; `dotenv-cli` defaults to non-override (`cli.js:33,88`; `dotenv` `main.js:338-348`). `.env.dev` only fills missing keys, so `NEXT_PUBLIC_ENV=prod` / `POSTGRES_URL=…5435/prod` survive into `next dev`. The DB guardrail (`guardrails.ts:31-42`) only rejects *mismatched* pairs; dev-url + `NEXT_PUBLIC_ENV=prod` is rejected, but prod-url + prod-env passes silently.
3. **`resolveEnvFile()` follows the ambient `NEXT_PUBLIC_ENV`.** `db:generate`/`db:push` (`packages/chatbot/package.json:15-16`, root `:13-14`) run drizzle-kit unwrapped, so `drizzle.config.ts:8` can load `.env.prod`; same for `migrate.ts:8`, `seed-test-data.ts:121`, `eval-runner.ts:49` when not invoked through their `dotenv -o -e .env.<env>` wrappers.
4. **`next dev` fills gaps from a stale mixed file.** `packages/chatbot/.env.development.local` (gitignored, identical to the repo-root copy) is auto-loaded by `@next/env` (project-dir file, dev mode) but never overrides existing keys; it contributes `POSTGRES_URL=localhost:5433/main`, worker `3015`, artifacts URL `:3015`, sessions dir prod path, and (during `pnpm dev`) only `BLOB_READ_WRITE_TOKEN`/`VERCEL_OIDC_TOKEN`/`XAI_API_KEY`.
5. **Prod secrets persisted in cleartext in `~/.pm2/dump.pm2`** for app `ai-chatbot` (`env_file: .env.prod` + 112-key inline snapshot), file mode `-rw-rw-r--`.
6. **Cross-app env_file resolution.** pm2 app `book-translator` (cwd `/home/javier/projects/ai-chatbot`) points `env_file` at `.env.development.local`, so that repo's stale file (pg `5433/main`, worker `3015`) is loaded by an unrelated app.
7. **`~/.bashrc:125` holds a plaintext `VERCEL_AI_GATEWAY_API_KEY`** (value masked); it is not among the keys seen in the current non-interactive shell's environment.
8. **`.env.test` is committed** (not gitignored) while `.env.dev`, `.env.prod` and `*.local` are ignored (`.gitignore:41-44`).
9. **Test runners bypass env files**: `test:unit|component|integration|contract` load nothing (`vitest.config.ts` sets only `NODE_ENV`), so they see whatever the ambient env has.
10. **Defaults point at prod ports**: `packages/config/src/catalog.ts:32-33` — `CODING_AGENT_WORKER_URL` default `http://localhost:3015`, `CODING_AGENT_WORKER_PORT` default `3015`.
