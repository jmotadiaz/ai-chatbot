# Agent Instructions — coding-agent

HTTP worker that wraps `@earendil-works/pi-coding-agent`. Manages coding agent sessions, translates Pi events into AG-UI protocol events, and exposes an `/rpc` endpoint.

> ⛔ El worker de prod (`:3015`) está VIVO bajo pm2: aplica el blindaje approval-first
> de la raíz — ver «Producción está VIVA» en `AGENTS.md` antes de cualquier comando
> que toque pm2/prod. Para verificar compilación, usa **siempre `build:verify`**
> (`pnpm --filter coding-agent build:verify` → `dist/verify` + `.pi-verify`);
> **nunca `build`** — pisa `dist`/`.pi-prod` de prod bajo pm2.

## Entornos y scripts

- **Dev** (`pnpm dev` con `.env.dev` → `3000`+`3016`, `.pi-dev`): `pnpm --filter coding-agent dev` → `tsx` directo; **parada segura `pnpm --filter coding-agent stop:dev` (lsof -ti:3016 | xargs -r kill) o `pnpm stop:dev` en raíz (3000+3016). Nunca `pkill -f tsx` — `dev` y `prod` comparten `tsx src/transports/http.ts` y matarías `3015` de prod.**
- **Prod** (`pm2 preview` con `.env.prod` → `8085`+`3015`, `.pi-prod`): 1 app `pm2 → pnpm preview` que hace `ALLOW_PROD_BUILD=1 build` de ambos packages y arranca `next start` + `node --import tsx dist/transports/http.js` (worker ya **compilado**, no `tsx` directo). `build` solo operador/CI (`ALLOW_PROD_BUILD=1`).
- **Test** (`NEXT_PUBLIC_ENV=test` → `3001` stub + `5434`, `.pi-test`): `pnpm --filter chatbot test:e2e` + `pnpm stop:test` (mata `3001`).
- **Verificación sin tocar prod**: el agente ejecuta `build:verify` (escribe a `dist/verify` + `.pi-verify/models.json`, sin `dotenv -o .env.prod` — no toca estado de runtime de prod).

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

## Built-in Skills (`skills/`)

Standalone Agent Skills live under `skills/<name>/SKILL.md` (e.g. `skills/writing-prompties/`, `skills/mobile-first-artifacts/`). They require no TypeScript runtime hooks and are discovered automatically via `getBuiltinSkillPaths()` in `src/pi-packages.ts` passed to `additionalSkillPaths`.

## First-Party Extensions

Extensions live inside `extensions/<name>/index.ts` and are handed to the Pi SDK via `resourceLoaderOptions.additionalExtensionPaths`. `pi install` is not used because it modifies machine-wide Pi settings.

### Subagent (`extensions/subagent/`)

First-party Pi extension (`extensions/subagent/`) that registers a `subagent` tool, letting a session delegate self-contained tasks to in-process child sessions (design: `docs/archive/specs/2026-08-02-subagent-extension-design.md`).

- **Loading:** `getExtensionPaths()` in `src/pi-packages.ts` appends first-party `extensions/<name>/index.ts` **files** to `additionalExtensionPaths`. Passing the directory instead silently skips the extension: pi's `resolveLocalExtensionSource` treats a directory containing `skills/` as a package and registers only its resources, never the entrypoint — so no hook (`resources_discover`, `context`, …) runs. `additionalSkillPaths` currently carries only the built-in `skills/` directory; `getFirstPartySkillPaths()` exists for a future first-party extension that ships its own `skills/` but currently returns none.
- **Anti-recursion:** `makeCreateRuntime(modelId, { includeSubagentExtension: false })` excludes the `subagent` extension; `runSubagent` creates every child runtime that way, so a child never gets the `subagent` tool (max depth 1 by construction) and executes one specific task from a self-contained brief.
- **Dispatch:** the tool's `execute` resolves the parent Pi session id from `ctx.sessionManager.getSessionId()` and delegates to `runSubagent()` in `src/session-manager.ts`, which validates `cwd` (must resolve to an existing directory inside the project root, e.g. a worktree) and `model` (strict match; errors carry the full available-models list), then creates the child session.
- **Persistence:** child sessions live under `<CODING_AGENT_SESSIONS_DIR>/subagents/` so `SessionManager.list(SESSIONS_DIR)` never mixes them into top-level reloads. They never get a row in the chatbot's `codingAgentSessions` table, so they cannot appear in the sidebar.
- **Events:** `startSubagentCollector` (`src/subagent-collector.ts`) translates child Pi events into the child's own `SessionEventLog` — no files-changed diff, no MESSAGES_SNAPSHOT. The entry stays in the `sessions` Map after the run so the dedicated UI view can snapshot/stream it; `disposeSession(parent)` reaps registered children.
- **Access guard:** entries carry `parentSessionId`; `getSessionSnapshot`/`getSessionMessages`/`getSessionStatus`/`connectToSession` require the matching `parentSessionId` param for subagent sessions and ignore it for normal ones. A presented `parentSessionId` on the cold path also makes `getSessionMessages` rehydrate from the `subagents/` subdir.
- **Lookup RPC:** `getSubagentSession(parentSessionId, toolCallId)` resolves `toolCallId → { subSessionId, subPiSessionId }` from the in-memory Map or, cold, from the persisted tool result's `details` (rehydrating the child from disk). The chatbot renders a "Ver sesión del subagente" link to the nested route `agent/code/[project]/[sessionId]/subagent/[subSessionId]`.

### Artifacts (`extensions/artifacts/`)

Reportes y documentos generados por el agente que el humano debe poder abrir en el
navegador. Why: the vendored skills (Matt Pocock's `improve-codebase-architecture`,
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
  agent shows are already correct — el mismo host que ya usa el navegador para el
  chat sirve los reportes.
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
  model then reads, so skills that were never patched still deliver links (y los
  `.html` del repo a propósito no cuentan). Repo-internal HTML is excluded by the
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
