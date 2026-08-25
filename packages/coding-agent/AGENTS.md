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
| `skills/` | Standalone built-in skills (`<skill>/SKILL.md`) without TypeScript entrypoints |
| `extensions/superpowers/` | First-party Superpowers extension (skills suite & bootstrap context) |
| `extensions/subagent/` | First-party `subagent` tool (thin shell over `runSubagent` in `session-manager.ts`) |
| `scripts/install-packages.ts` | Clones/updates third-party Pi packages if defined |

## Built-in Skills (`skills/`)

Standalone Agent Skills live under `skills/<name>/SKILL.md` (e.g. `skills/writing-prompties/`). They require no TypeScript runtime hooks and are discovered automatically via `getBuiltinSkillPaths()` in `src/pi-packages.ts` passed to `additionalSkillPaths`.

## First-Party Extensions

Extensions live inside `extensions/<name>/index.ts` and are handed to the Pi SDK via `resourceLoaderOptions.additionalExtensionPaths`. `pi install` is not used because it modifies machine-wide Pi settings.

### Superpowers (`extensions/superpowers/`)

First-party extension bundling the [Superpowers](https://github.com/obra/superpowers) skill suite and the using-superpowers bootstrap.

- **Skills:** 13 skills live in `extensions/superpowers/skills/`. The `brainstorming` skill is customized to use the harness's file browser for uncommitted spec reviews. `using-superpowers` is NOT a skill file: it was extracted into `extensions/superpowers/using-superpowers.ts`.
- **Entrypoint:** `extensions/superpowers/index.ts` discovers `./skills` via `resources_discover` and injects `USING_SUPERPOWERS_PROMPT` through the upstream channel: `pi.on("context")` prepends it as a user message at the head of the context (after any `compactionSummary`), wrapped in `<EXTREMELY_IMPORTANT>`. That channel is live in pi 0.79.3 (`dist/core/sdk.js` wires `transformContext` → `ExtensionRunner.emitContext`; `@earendil-works/pi-agent-core` applies it in `streamAssistantResponse`). The injection is unconditional — every LLM call, not just the first turn of a session as upstream does, so following turns never depend on the model choosing to load `using-superpowers` by itself. The transform runs on a clone, so the bootstrap never reaches `session.messages`, the session file, or the transcript. Intercambio, no superposición: `src/session-manager.ts` NO añade el bootstrap vía `resourceLoaderOptions.appendSystemPrompt` (solo queda `FILE_REFERENCE_PROMPT`).
- **Bootstrap:** `USING_SUPERPOWERS_PROMPT` de `extensions/superpowers/using-superpowers.ts` lo inyecta la propia extensión. Subagent excluye **toda** la extensión (bootstrap + 13 skills) vía `includeSuperpowersExtension: false`, así que no lleva `<SUBAGENT-STOP>`.
- **Documentation & Upgrades:** `extensions/superpowers/AGENTS.md` records the upstream version (`v6.2.0`), all modifications applied to skills, and the upgrade procedure.

### Subagent (`extensions/subagent/`)

First-party Pi extension (`extensions/subagent/`) that registers a `subagent` tool, letting a session delegate self-contained tasks to in-process child sessions (design: `docs/superpowers/specs/2026-08-02-subagent-extension-design.md`).

- **Loading:** `getExtensionPaths()` in `src/pi-packages.ts` appends first-party `extensions/<name>/index.ts` **files** to `additionalExtensionPaths`. Passing the directory instead silently skips the extension: pi's `resolveLocalExtensionSource` treats a directory containing `skills/` as a package and registers only its resources, never the entrypoint — so no hook (`resources_discover`, `context`, …) runs. Skills therefore travel via `additionalSkillPaths` (`getFirstPartySkillPathsFiltered`).
- **Anti-recursion / orchestrator-only skills:** `makeCreateRuntime(modelId, { includeSubagentExtension: false })` excludes the `subagent` extension dir *and* the `superpowers` extension dir (`includeSuperpowersExtension: false`); `runSubagent` creates every child runtime that way, so a child never gets the `subagent` tool (max depth 1 by construction) nor the superpowers skills/bootstrap — a subagent executes one specific task from a self-contained brief.
- **Dispatch:** the tool's `execute` resolves the parent Pi session id from `ctx.sessionManager.getSessionId()` and delegates to `runSubagent()` in `src/session-manager.ts`, which validates `cwd` (must resolve to an existing directory inside the project root, e.g. a worktree) and `model` (strict match; errors carry the full available-models list), then creates the child session.
- **Persistence:** child sessions live under `<CODING_AGENT_SESSIONS_DIR>/subagents/` so `SessionManager.list(SESSIONS_DIR)` never mixes them into top-level reloads. They never get a row in the chatbot's `codingAgentSessions` table, so they cannot appear in the sidebar.
- **Events:** `startSubagentCollector` (`src/subagent-collector.ts`) translates child Pi events into the child's own `SessionEventLog` — no files-changed diff, no MESSAGES_SNAPSHOT. The entry stays in the `sessions` Map after the run so the dedicated UI view can snapshot/stream it; `disposeSession(parent)` reaps registered children.
- **Access guard:** entries carry `parentSessionId`; `getSessionSnapshot`/`getSessionMessages`/`getSessionStatus`/`connectToSession` require the matching `parentSessionId` param for subagent sessions and ignore it for normal ones. A presented `parentSessionId` on the cold path also makes `getSessionMessages` rehydrate from the `subagents/` subdir.
- **Lookup RPC:** `getSubagentSession(parentSessionId, toolCallId)` resolves `toolCallId → { subSessionId, subPiSessionId }` from the in-memory Map or, cold, from the persisted tool result's `details` (rehydrating the child from disk). The chatbot renders a "Ver sesión del subagente" link to the nested route `agent/code/[project]/[sessionId]/subagent/[subSessionId]`.
