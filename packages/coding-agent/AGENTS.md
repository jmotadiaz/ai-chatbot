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
| `src/pi-packages.ts` | First-party extension discovery + Pi packages loader |
| `src/subagent-collector.ts` | Child event collector: Pi events → AG-UI → the subagent's own event log |
| `extensions/superpowers/` | First-party Superpowers extension (skills suite & bootstrap context) |
| `extensions/subagent/` | First-party `subagent` tool (thin shell over `runSubagent` in `session-manager.ts`) |
| `scripts/install-packages.ts` | Clones/updates third-party Pi packages if defined |

## First-Party Extensions

Extensions live inside `extensions/<name>/index.ts` and are handed to the Pi SDK via `resourceLoaderOptions.additionalExtensionPaths`. `pi install` is not used because it modifies machine-wide Pi settings.

### Superpowers (`extensions/superpowers/`)

First-party extension bundling the [Superpowers](https://github.com/obra/superpowers) skill suite and the using-superpowers bootstrap.

- **Skills:** 13 skills live in `extensions/superpowers/skills/`. The `brainstorming` skill is customized to use the harness's file browser for uncommitted spec reviews. `using-superpowers` is NOT a skill file anymore: it was extracted into `extensions/superpowers/using-superpowers.ts` so the harness can load it from the start.
- **Entrypoint:** `extensions/superpowers/index.ts` discovers `./skills` via `resources_discover`. Runtime context injection was removed: the SDK never emits the extension `context` event (no provider adapter consumes `transformContext`), so the bootstrap would never fire.
- **Bootstrap:** `USING_SUPERPOWERS_PROMPT` from `extensions/superpowers/using-superpowers.ts` is appended to top-level sessions' system prompt via `resourceLoaderOptions.appendSystemPrompt` in `src/session-manager.ts` — the only channel verified to reach every model request. Subagent runtimes exclude the **whole** extension (bootstrap + the 13 skills) structurally: `makeCreateRuntime` passes `includeSuperpowersExtension: false` alongside the same `includeSubagentExtension: false` flag that removes the `subagent` tool, so the content carries no `<SUBAGENT-STOP>` block.
- **Documentation & Upgrades:** `extensions/superpowers/AGENTS.md` records the upstream version (`v6.2.0`), all modifications applied to skills, and the upgrade procedure.

### Subagent (`extensions/subagent/`)

First-party Pi extension (`extensions/subagent/`) that registers a `subagent` tool, letting a session delegate self-contained tasks to in-process child sessions (design: `docs/superpowers/specs/2026-08-02-subagent-extension-design.md`).

- **Loading:** `getExtensionPaths()` in `src/pi-packages.ts` appends first-party dirs under `extensions/` (each with an `index.ts`) to `additionalExtensionPaths`.
- **Anti-recursion / orchestrator-only skills:** `makeCreateRuntime(modelId, { includeSubagentExtension: false })` excludes the `subagent` extension dir *and* the `superpowers` extension dir (`includeSuperpowersExtension: false`); `runSubagent` creates every child runtime that way, so a child never gets the `subagent` tool (max depth 1 by construction) nor the superpowers skills/bootstrap — a subagent executes one specific task from a self-contained brief.
- **Dispatch:** the tool's `execute` resolves the parent Pi session id from `ctx.sessionManager.getSessionId()` and delegates to `runSubagent()` in `src/session-manager.ts`, which validates `cwd` (must resolve to an existing directory inside the project root, e.g. a worktree) and `model` (strict match; errors carry the full available-models list), then creates the child session.
- **Persistence:** child sessions live under `<CODING_AGENT_SESSIONS_DIR>/subagents/` so `SessionManager.list(SESSIONS_DIR)` never mixes them into top-level reloads. They never get a row in the chatbot's `codingAgentSessions` table, so they cannot appear in the sidebar.
- **Events:** `startSubagentCollector` (`src/subagent-collector.ts`) translates child Pi events into the child's own `SessionEventLog` — no files-changed diff, no MESSAGES_SNAPSHOT. The entry stays in the `sessions` Map after the run so the dedicated UI view can snapshot/stream it; `disposeSession(parent)` reaps registered children.
- **Access guard:** entries carry `parentSessionId`; `getSessionSnapshot`/`getSessionMessages`/`getSessionStatus`/`connectToSession` require the matching `parentSessionId` param for subagent sessions and ignore it for normal ones. A presented `parentSessionId` on the cold path also makes `getSessionMessages` rehydrate from the `subagents/` subdir.
- **Lookup RPC:** `getSubagentSession(parentSessionId, toolCallId)` resolves `toolCallId → { subSessionId, subPiSessionId }` from the in-memory Map or, cold, from the persisted tool result's `details` (rehydrating the child from disk). The chatbot renders a "Ver sesión del subagente" link to the nested route `agent/code/[project]/[sessionId]/subagent/[subSessionId]`.
