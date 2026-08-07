# Agent Instructions — coding-agent

HTTP worker that wraps `@earendil-works/pi-coding-agent`. Manages coding agent sessions, translates Pi events into AG-UI protocol events, and exposes an `/rpc` endpoint.

## Key Files

| File | Responsibility |
| --- | --- |
| `src/index.ts` | Type definitions and public exports |
| `src/session-manager.ts` | Session lifecycle: create, run, reconnect, dispose |
| `src/pi-to-agui-translator.ts` | Pi events → AG-UI protocol events |
| `src/event-log.ts` | In-memory event log with pub/sub for replay |
| `src/replay-compaction.ts` | Merges consecutive streaming deltas (chunks/args) before reconnect replay |
| `src/transports/http.ts` | HTTP server with `/rpc` POST endpoint |
| `src/pi-packages.ts` | Pi packages the worker loads (checkout dir, pinned refs) + first-party extension paths |
| `src/subagent-collector.ts` | Child event collector: Pi events → AG-UI → the subagent's own event log |
| `extensions/subagent/` | First-party `subagent` tool (thin shell over `runSubagent` in `session-manager.ts`) |
| `scripts/install-packages.ts` | Clones/updates those packages before the worker starts |

## Pi Packages

The worker loads Pi packages through the SDK, not through the `pi` CLI. `scripts/install-packages.ts` clones each entry of `PI_PACKAGES` into `.pi/packages/<name>` at the pinned ref, and `session-manager.ts` passes those paths as `resourceLoaderOptions.additionalExtensionPaths` — the programmatic equivalent of `pi -e <source>`. `pi install` is deliberately not used: it writes to the machine-wide `~/.pi/agent/settings.json` and would change every `pi` run outside this repo, the same reason `models.json` is project-scoped.

Currently installed: [superpowers](https://github.com/obra/superpowers) (skills for brainstorming, planning, TDD and systematic debugging, plus an extension that injects the `using-superpowers` bootstrap at session start and after compaction).

| Env var | Default | Purpose |
| --- | --- | --- |
| `CODING_AGENT_PI_PACKAGES_DIR` | `.pi/packages` | Checkout directory (relative values resolve against `packages/coding-agent`) |
| `CODING_AGENT_SUPERPOWERS_REF` | `v6.2.0` | Git ref for superpowers |

The install step is idempotent and skips the network when the checkout already matches the pinned ref, so it runs on every `transport:http` start. It never fails the worker: if the clone or fetch fails, the worker starts with whatever is on disk (possibly nothing). Run `pnpm --filter coding-agent packages:install --force` to re-fetch a moving ref.

Some packages declare `pi.skills` in their manifest **and** register the same skills dir via an extension `resources_discover` hook. The SDK loads package-declared skills during `reload()` (before any extension hook) and resolves same-name skills first-wins, so a manifest-declared `brainstorming` would always shadow `skills-override/`. `scripts/install-packages.ts` therefore strips the `pi.skills` manifest entry (flag `stripManifestSkills` in `src/pi-packages.ts`) after checkout, so those skills arrive only through the package extension — loaded after the harness override extension, which then wins the name collision.

## Subagent Extension

First-party Pi extension (`extensions/subagent/`) that registers a `subagent` tool, letting a session delegate self-contained tasks to in-process child sessions (design: `docs/superpowers/specs/2026-08-02-subagent-extension-design.md`).

- **Loading:** `getExtensionPaths()` in `src/pi-packages.ts` appends first-party dirs under `extensions/` (each with an `index.ts`) to `additionalExtensionPaths`. It never goes through `pi install` or `PI_PACKAGES` (those are pinned third-party checkouts).
- **Anti-recursion:** `makeCreateRuntime(modelId, { includeSubagentExtension: false })` excludes the extension dir; `runSubagent` creates every child runtime that way, so a child never gets the `subagent` tool (max depth 1 by construction).
- **Dispatch:** the tool's `execute` resolves the parent Pi session id from `ctx.sessionManager.getSessionId()` and delegates to `runSubagent()` in `src/session-manager.ts`, which validates `cwd` (must resolve to an existing directory inside the project root, e.g. a worktree) and `model` (strict match; errors carry the full available-models list), then creates the child session.
- **Persistence:** child sessions live under `<CODING_AGENT_SESSIONS_DIR>/subagents/` so `SessionManager.list(SESSIONS_DIR)` never mixes them into top-level reloads. They never get a row in the chatbot's `codingAgentSessions` table, so they cannot appear in the sidebar.
- **Events:** `startSubagentCollector` (`src/subagent-collector.ts`) translates child Pi events into the child's own `SessionEventLog` — no files-changed diff, no MESSAGES_SNAPSHOT. The entry stays in the `sessions` Map after the run so the dedicated UI view can snapshot/stream it; `disposeSession(parent)` reaps registered children.
- **Access guard:** entries carry `parentSessionId`; `getSessionSnapshot`/`getSessionMessages`/`getSessionStatus`/`connectToSession` require the matching `parentSessionId` param for subagent sessions and ignore it for normal ones. A presented `parentSessionId` on the cold path also makes `getSessionMessages` rehydrate from the `subagents/` subdir.
- **Lookup RPC:** `getSubagentSession(parentSessionId, toolCallId)` resolves `toolCallId → { subSessionId, subPiSessionId }` from the in-memory Map or, cold, from the persisted tool result's `details` (rehydrating the child from disk). The chatbot renders a "Ver sesión del subagente" link to the nested route `agent/code/[project]/[sessionId]/subagent/[subSessionId]`.
