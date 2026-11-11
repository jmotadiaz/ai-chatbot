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
  `tests/unit/architecture/no-process-env-mutations.test.ts`.
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
  (`pnpm --filter coding-agent test:unit`, part of the root `pnpm test:unit`):
  one unit category under `tests/unit/`, no external PostgreSQL and no canonical
  port. The toolkit servers a transport test starts listen on an ephemeral port
  (`0`) and are closed by the test that opened them. The provisioning-based
  profile (`pnpm test:infra`) selects only chatbot tests today; see
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
| `src/transports/http.ts` | HTTP server with the `/rpc` POST endpoint (the only route) |
| `src/artifacts/artifacts.ts` | Publishing HTML artifacts to `<root>/<project>/<name>/index.html` and the Chatbot view path |
| `src/pi-packages.ts` | First-party extension discovery + Pi packages loader |
| `src/subagent-collector.ts` | Child event collector: Pi events → AG-UI → the subagent's own event log |
| `skills/` | Standalone built-in skills (`<skill>/SKILL.md`) without TypeScript entrypoints |
| `extensions/commit-attribution/` | First-party extension: injects model-specific Co-Authored-By attribution into the system prompt |
| `extensions/subagent/` | First-party `subagent` tool (thin shell over `runSubagent` in `session-manager.ts`) |
| `extensions/artifacts/` | First-party `publish_artifact({ path, name })` tool + `/artifacts` command |
| `extensions/tool-pruning/` | First-party Tool Pruning extension: thin `pi.on("context")` shell over `src/pruning/` |
| `src/pruning/` | Tool Pruning engine: `config`, `mask`, `messages`, `cooling-window`, `supersession`, `decision-state`, `systemone-client`, `epoch-runner`, `pruning-bridge` |
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

Standalone Agent Skills live under `skills/<name>/SKILL.md` (e.g. `skills/writing-prompties/`, `skills/mobile-first-artifacts/`, `skills/prototype/`). They require no TypeScript runtime hooks and are discovered automatically via `getBuiltinSkillPaths()` in `src/pi-packages.ts` passed to `additionalSkillPaths`.

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

Standalone HTML documents the agent generates for the human to open, such as
architecture reviews from `archify` or `improve-codebase-architecture`. The
skills write to the OS temp directory and `xdg-open` the file. This host is
headless, so the open is a no-op. Publishing replaces "open it" with a Chatbot
view path the user follows in the browser.

- **Contract:** `publish_artifact({ path, name })` copies `path` to
  `<artifactsDir>/<project>/<name>/index.html` (overwriting in place when the
  name repeats). `path` is an `.html`/`.htm` file or a folder holding `index.html`.
  Other inputs, missing paths and unsafe names return an error result. They never
  throw into the agent loop. The project is `projectSlug(ctx.cwd)`.
- **Returned path:** `/agent/code/<project>/<sessionId>/artifacts/<name>`, encoded
  per segment. It is Chatbot-relative: no host and no worker port. The session id
  comes from `ctx.sessionManager.getSessionId()`.
- **Serving:** the worker serves nothing over HTTP. The Chatbot reads the artifacts
  root directly (`codingAgentArtifactsDir`) through its own authenticated route.
  See the chatbot's artifact view.
- **Where files land:** `CODING_AGENT_ARTIFACTS_DIR` (`codingAgentArtifactsDir`),
  default `packages/coding-agent/.pi/artifacts/`, gitignored.
- **No implicit publishing:** nothing publishes on `write`. Only the explicit tool
  call does, so a repo file or temp file is never published by accident.
- **`/artifacts` command:** lists `<project>/<name>` entries with their view paths
  for the current session.
- **Mobile-first:** artifacts are opened on phones as much as on desktops, so
  `skills/mobile-first-artifacts/SKILL.md` carries the authoring rules.
- **Subagents:** not excluded by `getExtensionPaths()`, so child sessions get the tool
  too.
- **Tests:** `tests/unit/artifacts/artifacts.test.ts` (layout, overwrite, rejection, view
  path), `tests/unit/artifacts/artifacts-extension.test.ts` (tool boundary, command,
  no hook), `tests/unit/artifacts/artifacts-server.test.ts` (the worker no longer serves
  `/artifacts`).

### Tool Pruning (`extensions/tool-pruning/`)

Watermark-gated Epoch masking of stale tool payloads (spec `.scratch/tool-pruning/spec.md`).
A long session accumulates `read`, `grep` and `bash` bodies that go obsolete a few Turns
later and push Pi into a lossy Compaction. The extension masks them in the projection the
provider receives (`pi.on("context")`) while the session `.jsonl`, the AG-UI event log and
the UI keep the full transcript. Until a watermark says the context is under real pressure
an Epoch stays silent: no HTTP, no latency, KV cache intact.

`extensions/tool-pruning/index.ts` is a thin shell. It resolves what the runner cannot own
from inside jiti and nothing else: credentials from `ctx.model` / `ctx.modelRegistry`
(never `process.env`), the active session branch, and the worker's real trace logger
through the pruning bridge. The engine lives in `src/pruning/` and never imports worker
`src/` runtime modules, global config or `process.env`.

| Module | Responsibility |
| --- | --- |
| `config.ts` | `ToolPruningConfig`, spec defaults and overrides, epoch entry and signal types |
| `mask.ts` | Applies a decision mask to a message projection (`drop_call`, `drop_result` stubs) |
| `messages.ts` | Shared, index-based readers over a `AgentMessage[]`: tool-call index and typed argument readers |
| `cooling-window.ts` | Cooling Window: candidate pairs outside the union of independent protected spans (recent tail floor, capped active Turn and capped last completed tool Turn scaled by `min(maxProtectedTurnTokens, maxProtectedTurnRatio * contextWindow)`) |
| `supersession.ts` | Phase 0: free deterministic drops (superseded reads and rerun/succeeded commands) and relative `(watermark - watermarkGapRatio)` short-circuit |
| `decision-state.ts` | Phase 1 state document, question building, batching, budget fitting and the single conservative drop band (`applyDecisionPolicy`) |
| `systemone-client.ts` | `POST /v1/systemone` transport: 4 s timeout, Turn abort, typed failures |
| `epoch-runner.ts` | Cadence (watermark staircase with `watermarkGapRatio` re-arming), Phase 0 → Phase 1 orchestration, fail-open, branch-aware persistence |
| `pruning-bridge.ts` | `Symbol.for` handoff of the trace logger factory and config overrides to the jiti copy |

- **Persistence:** every completed Epoch appends a `ToolPruningEpochEntry` to the session
  branch, including short-circuited and failed-open ones, because the entry *is* the
  consumed step. Each entry also carries `audit: ToolPruningCandidateAudit[]` with the
  per-candidate `noul` probabilities (`keepResult`, `keepCall`), decision source
  (`"phase0" | "judge" | "leftover"`) and target for post-hoc analysis
  (`pnpm --filter coding-agent analyze:pruning`). Masks and the watermark floor are
  rebuilt from `getBranch()`, so a Message Edit that abandons a branch abandons its masks
  and steps too; a `compaction` entry rearms the whole staircase while preserving masks on
  the active branch so pruned outputs inside Pi's kept recent tail never resurrect, and a
  deep prune re-arms any step at least `watermarkGapRatio` (`0.15`) above its landing ratio.
- **Active tokens:** `measureProjection` corrects the provider's last `usage` with the
  reductions that landed *after* that usage boundary, never with the whole mask, so a
  saving is subtracted exactly once.
- **Tests:** `tests/unit/pruning/` (`mask`, `cooling-window`, `supersession`,
  `decision-state`, `policy`, `systemone-client`, `epoch-runner`, `session-integration`),
  sharing `fixtures.ts`. The Gateway is substituted through the toolkit
  (`packages/model-gateway/js/`), never a `fetch` spy.

### Commit Attribution (`extensions/commit-attribution/`)

First-party Pi extension (`extensions/commit-attribution/`) that injects model-specific git commit attribution instructions into the system prompt.

- **Dynamic adaptation:** hooks into `before_agent_start` on every turn, reading `ctx.model` (name or id) and appending the exact `Co-Authored-By: <model>` trailer requirement to `event.systemPrompt`. If the session switches models mid-flight (via turn configuration), the system prompt dynamically updates for the next turn.
- **Subagents:** included for subagents as well as orchestrators, ensuring delegated tasks also commit with appropriate attribution.
- **Tests:** `tests/unit/extensions/commit-attribution-extension.test.ts`.
