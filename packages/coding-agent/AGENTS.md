# Agent Instructions — coding-agent

HTTP worker that wraps `@earendil-works/pi-coding-agent`. Manages coding agent sessions, translates Pi events into AG-UI protocol events, and exposes an `/rpc` endpoint.

> ⛔ The prod worker (`:3015`) is LIVE under pm2: root's approval-first guardrails
> apply — see "Production is LIVE" in `AGENTS.md` before any command that touches
> pm2/prod. To check compilation, **always use `build:verify`**
> (`pnpm --filter coding-agent build:verify` → `dist/verify` + `.pi-verify`);
> **never `build`** — it overwrites prod's `dist`/`.pi-prod` under pm2.

## Environments and scripts

Configuration does NOT use `.env.*` files or environment-variable selectors (ADR
0011): `packages/config` exposes TS bundles typed per Environment and the active
Environment travels through `--env=prod|dev|test` in `process.argv` (`initConfig()`
in the runners). See "config — Typed per-Environment configuration" in the root
`AGENTS.md`.

- **Dev** (`pnpm dev` → `--env=dev`: `3000`+`3016`, `.pi-dev`): `pnpm --filter coding-agent dev` → `tsx` directly; **safe stop: `pnpm --filter coding-agent stop:dev` (lsof -ti:3016 | xargs -r kill) or `pnpm stop:dev` at the root (3000+3016). Never `pkill -f tsx` — `dev` and `prod` share `tsx src/transports/http.ts` and you would kill prod's `3015`.**
- **Prod** (`pnpm preview` → `--env=prod`: `8085`+`3015`, `.pi-prod`): 1 pm2 app → `pnpm preview`, which runs `ALLOW_PROD_BUILD=1 build` for both packages and starts `next start` + `node --import tsx dist/transports/http.js` (worker already **compiled**, not `tsx` directly). `build` is operator/CI only (`ALLOW_PROD_BUILD=1` or `--allow-prod-build`).
- **Test** (`--env=test` → `3001` stub + `5434`, `.pi-test`): `pnpm --filter chatbot test:e2e` + `pnpm stop:test` (kills `3001`).
- **Verification without touching prod**: the agent runs `build:verify` (writes to `dist/verify` + `.pi-verify/models.json` — it never touches prod runtime state).

## DI and test isolation

- Mutating `process.env.CODING_AGENT_*` / `process.env.MODEL_GATEWAY_*` in
  `tests/**` is forbidden: config is injected as a parameter (`GatewayRuntimeConfig` /
  `WorkerRuntimeConfig` in `src/runtime/runtime-config.ts`). The composition root
  (`src/transports/http.ts`) is the only one that uses `packages/config` defaults.
- Use `createTestWorkerContext()` (`tests/helpers/test-context.ts`): it creates a
  `mkdtempSync` sandbox with `projectsRoot`, `sessionsDir`, `modelsJsonPath`, `authJsonPath`,
  `agentDir`, `piPackagesDir`, `artifactsDir`, and `cleanup()` for `afterEach`.
- A test NEVER writes to `.pi-prod` or `.pi-dev`. Contract:
  `tests/contract/no-process-env-mutations.test.ts`.
- The Model Gateway seam is substituted with the official toolkit
  (`@ai-chatbot/model-gateway-testing`, ADR 0013), never by stubbing
  `globalThis.fetch`:
  - `tests/helpers/gateway-harness.ts` (`setupWorkerGatewayHarness()`) installs
    one scenario per test through MSW: the worker's real catalog `fetch` runs and
    is answered in-process, so the suite needs **no listening gateway**.
  - Catalog entries/ids stay in the Worker (`GatewayModelEntry[]` passed as
    `catalog.public`). A test that needs the Gateway to publish, drop or lose a
    model opens a new phase with `gateway.use({...})` — a fresh scenario whose
    `requests` are that phase's audits. `gateway.failTransport()` expresses an
    unreachable Gateway (fetch rejects, as with `ECONNREFUSED`).
  - Tests whose subject IS the transport (catalog URL/origin, bearer header,
    real `ECONNREFUSED`) use the toolkit's HTTP server
    (`@ai-chatbot/model-gateway-testing/server`, ephemeral port, closed by the
    test): MSW answers every origin, so only a real origin proves which URL the
    worker targeted.
  - Keep the doubles of genuinely different dependencies: the Pi SDK mock,
    `tracing`, the filesystem sandbox (`createTestWorkerContext()`) and the
    worker's own HTTP transport. The Chatbot E2E suite keeps its Worker stub and
    does not cover the real chatbot↔Worker assembly.
- Worker tests all belong to the **self-contained default profile**
  (`pnpm --filter coding-agent test:unit|test:integration|test:contract`): no
  external PostgreSQL and no canonical port. The toolkit servers a transport
  test starts listen on an ephemeral port (`0`) and are closed by the test that
  opened them. The provisioning-based profile (`pnpm test:infra`) selects only
  chatbot tests today; see
  [`packages/chatbot/tests/AGENTS.md`](../chatbot/tests/AGENTS.md#execution-profiles)
  for the profiles and [`docs/model-gateway-testing-migration.md`](../../docs/model-gateway-testing-migration.md)
  for the accounting of the doubles replaced in ticket 10.

## Key Files

| File | Responsibility |
| --- | --- |
| `src/index.ts` | Type definitions and public exports |
| `src/session-manager.ts` | Session lifecycle facade: create, run, reconnect, dispose |
| `src/turn-runner.ts` | Turn orchestration: prompt runs, live/reconnect event streaming, cancel |
| `src/pi-to-agui-translator.ts` | Pi events → AG-UI protocol events |
| `src/event-log.ts` | In-memory event log with pub/sub; `replayAfter(cursor)` is the reconnect seam (prelude + compaction) |
| `src/replay-compaction.ts` | Merges consecutive streaming deltas (chunks/args) before reconnect replay |
| `src/transports/http.ts` | HTTP server with `/rpc` POST endpoint + read-only `GET /artifacts` |
| `src/artifacts.ts` | Publishing generated reports into the artifacts root (names, slugs, index, URL) |
| `src/artifacts-http.ts` | `GET /artifacts` route matching and serving (CSP, no-store, containment) |
| `src/pi-packages.ts` | First-party extension discovery + Pi packages loader |
| `src/subagent-collector.ts` | Child event collector: Pi events → AG-UI → the subagent's own event log |
| `skills/` | Standalone built-in skills (`<skill>/SKILL.md`) without TypeScript entrypoints |
| `extensions/subagent/` | First-party `subagent` tool (thin shell over `runSubagent` in `session-manager.ts`) |
| `extensions/artifacts/` | First-party `publish_artifact` tool + automatic publishing of temp-dir reports |
| `scripts/install-packages.ts` | Clones/updates third-party Pi packages if defined |

## Model Catalog (runtime)

The worker's model catalog is synchronised against the Model Gateway (ADR 0010):
`src/runtime/gateway-catalog.ts` issues `GET /v1/models/catalog`, rewrites the
Environment's `models.json`/`auth.json` and updates the in-memory snapshot;
`src/runtime/model-runtime.ts` owns the `ModelRuntime` singleton and the
`refreshGatewayCatalog()` function (in-flight deduplication) invoked on **every
`getAvailableModels`** — a model added in the Gateway shows up in the code-chat
picker without restarting the worker. If the Gateway goes down during a refresh,
the last good catalog is kept (warning in the log). An unknown `modelId` never
fails silently: session creation (`initializeSession`) returns an RPC error and
the turn fails out of band with `RUN_ERROR`, both carrying the `modelId` in the
message.

## Built-in Skills (`skills/`)

Standalone Agent Skills live under `skills/<name>/SKILL.md` (e.g. `skills/writing-prompties/`, `skills/mobile-first-artifacts/`). They require no TypeScript runtime hooks and are discovered automatically via `getBuiltinSkillPaths()` in `src/pi-packages.ts` passed to `additionalSkillPaths`.

## First-Party Extensions

Extensions live inside `extensions/<name>/index.ts` and are handed to the Pi SDK via `resourceLoaderOptions.additionalExtensionPaths`. `pi install` is not used because it modifies machine-wide Pi settings.

### Subagent (`extensions/subagent/`)

First-party Pi extension (`extensions/subagent/`) that registers a `subagent` tool, letting a session delegate self-contained tasks to in-process child sessions (design: `docs/archive/specs/2026-08-02-subagent-extension-design.md`).

- **Loading:** `getExtensionPaths()` in `src/pi-packages.ts` appends first-party `extensions/<name>/index.ts` **files** to `additionalExtensionPaths`. Passing the directory instead silently skips the extension: pi's `resolveLocalExtensionSource` treats a directory containing `skills/` as a package and registers only its resources, never the entrypoint — so no hook (`resources_discover`, `context`, …) runs. `additionalSkillPaths` currently carries only the built-in `skills/` directory; `getFirstPartySkillPaths()` exists for a future first-party extension that ships its own `skills/` but currently returns none.
- **Anti-recursion:** `makeCreateRuntime(modelId, { includeSubagentExtension: false })` excludes the `subagent` extension; `runSubagent` creates every child runtime that way, so a child never gets the `subagent` tool (max depth 1 by construction) and executes one specific task from a self-contained brief.
- **Dispatch:** the tool's `execute` resolves the parent Pi session id from `ctx.sessionManager.getSessionId()` and delegates to `runSubagent()` in `src/session-manager.ts`, which validates `cwd` (must resolve to an existing directory inside the project root, e.g. a worktree) and `model` (strict match; errors carry the full available-models list), then creates the child session.
- **Persistence:** child sessions live under `<CODING_AGENT_SESSIONS_DIR>/subagents/`; `loadSessionFromDisk` resolves each transcript by file name (`<timestamp>_<sessionId>.jsonl`) in that scope's Pi sessions folder and opens it directly (never `SessionManager.list()`, which parses every transcript). The separate subdir is what keeps children out of top-level reloads. They never get a row in the chatbot's `codingAgentSessions` table, so they cannot appear in the sidebar.
- **Events:** `startSubagentCollector` (`src/subagent-collector.ts`) translates child Pi events into the child's own `SessionEventLog` — no files-changed diff, no MESSAGES_SNAPSHOT. The entry stays in the `sessions` Map after the run so the dedicated UI view can snapshot/stream it; `disposeSession(parent)` reaps registered children.
- **Access guard:** entries carry `parentSessionId`; `getSessionSnapshot`/`getSessionMessages`/`getSessionStatus`/`connectToSession` require the matching `parentSessionId` param for subagent sessions and ignore it for normal ones. A presented `parentSessionId` on the cold path also makes `getSessionMessages` rehydrate from the `subagents/` subdir.
- **Lookup RPC:** `getSubagentSession(parentSessionId, toolCallId)` resolves `toolCallId → { subSessionId, subPiSessionId }` from the in-memory Map or, cold, from the persisted tool result's `details` (rehydrating the child from disk). The chatbot renders a "Ver sesión del subagente" link to the nested route `agent/code/[project]/[sessionId]/subagent/[subSessionId]`.

### Artifacts (`extensions/artifacts/`)

Reports and documents generated by the agent that a human must be able to open in
the browser. Why: the vendored skills (Matt Pocock's `improve-codebase-architecture`,
`archify`, and friends) were written for a laptop — they write a self-contained HTML report to
the OS temp directory and `xdg-open` it. This host is headless, so the open is a
silent no-op and the artifact ends up stranded at a path nobody can reach. Publishing
replaces "open it" with "here's the URL".

- **Pieces:** all the logic lives in `src/artifacts.ts` (naming, project slugs,
  content-hash dedupe, index listing) with the HTTP half in `src/artifacts-http.ts`
  (`matchArtifactRoute`, `handleArtifactRequest`, `artifactCsp`).
  `src/transports/http.ts` wires `GET /artifacts` and
  `GET /artifacts/<project>/<name>` onto the same server as `POST /rpc`. The
  extension (`extensions/artifacts/index.ts`) is a thin shell: the
  `publish_artifact` tool, the automatic publish, and the `/artifacts` command.
- **No bridge:** unlike `extensions/subagent/`, this one imports `src/artifacts.ts`
  directly instead of going through a `globalThis` handoff. Artifacts are stateless,
  so jiti's second module instance is harmless; nothing is cached in module scope.
- **Where files land:** `CODING_AGENT_ARTIFACTS_DIR` (default
  `packages/coding-agent/.pi/artifacts/`, gitignored — like the temp dir it replaces,
  a report must never land in the repo), one subdirectory per project slug, source
  file left in place.
- **URL base:** `CODING_AGENT_ARTIFACTS_URL`, falling back to `CODING_AGENT_WORKER_URL`
  and then `http://localhost:<CODING_AGENT_WORKER_PORT>`. Left unset, the URLs the
  agent shows are already correct — the same host the browser already uses for the
  chat serves the reports.
- **Naming:** the published name is the source's own base name sanitized to a single
  safe segment (`architecture-review-20260831-153639.html` survives untouched).
  Republishing unchanged content reuses the same URL; changed content whose name is
  taken gets a `-<sha256[0:8]>` suffix instead of clobbering, so an old review is
  never lost to a re-run.
- **CSP coupling:** HTML reports are served with an allowlist for
  `cdn.tailwindcss.com` and `cdn.jsdelivr.net` (plus `'unsafe-eval'` — Tailwind's
  Play CDN is a JIT). A report that pulls its assets from anywhere else renders
  broken, which is why the vendored scaffold's CDN hosts are pinned in
  `HTML-REPORT.md` and asserted against the CSP in `tests/unit/artifacts-http.test.ts`.
- **Automatic publish:** a `tool_result` handler publishes any `write` of an
  HTML/markdown file inside `os.tmpdir()` and appends the URL to the tool result the
  model then reads, so skills that were never patched still deliver links (repo
  `.html` files deliberately don't count). Repo-internal HTML is excluded by the
  temp-directory test, not by name matching.
- **Mobile-first:** artifacts are opened on phones as much as on desktops, so
  `skills/mobile-first-artifacts/SKILL.md` carries the authoring rules (base layout
  one column, breakpoint prefixes add structure, wide content scrolls itself, type
  floor 12px, `useMaxWidth` for Mermaid, tap targets ≥44px). The rule is checkable:
  `pnpm --filter chatbot check:mobile <url>` (`packages/chatbot/scripts/check-mobile.ts`,
  Playwright lives in that package) measures horizontal overflow and sub-12px text at
  320px and 390px, exits non-zero, and names the offending elements. Written after
  measuring a real review at 134px of overflow and 296 text nodes < 12px.
- **Subagents:** not excluded by `getExtensionPaths()`, so child sessions get the tool
  too — a subagent asked to produce a report should be able to hand back a URL.
- **Tests:** `tests/unit/artifacts.test.ts`, `tests/unit/artifacts-http.test.ts`
  (including a route round-trip over hostile file names),
  `tests/integration/artifacts-server.test.ts` (real worker server on an ephemeral
  port), `tests/contract/artifacts-extension.test.ts` (tool boundary + hook).
