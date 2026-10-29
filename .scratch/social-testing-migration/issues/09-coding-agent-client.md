# 09: Migrar Coding Agent Client

**What to build:** Cubrir el comportamiento del Coding Agent Client en las
fronteras adecuadas y recuperar las garantías soportadas de los escenarios
omitidos escritos para una ruta que ya no existe.

**Blocked by:** 01: Preparar la transición y migrar Compaction.

**Status:** done

- [x] Se inventarían y consolidan los tests de Coding Agent UI y Coding Agent Bridge por garantía y riesgo, con colaboradores propios reales por defecto.
- [x] Se investigan los tres escenarios omitidos de sesión/envío, reconexión y agrupación de herramientas contra la interfaz actual y la cobertura activa existente.
- [x] Se restaura en la frontera adecuada toda garantía soportada que falte; la eliminación de comportamiento dudoso se consulta al operador.
- [x] Los E2E del chatbot mantienen el stub de Coding Agent Worker y cada E2E retenido explica por qué necesita un navegador real.
- [x] Se registran en los comentarios las equivalencias, los límites del stub y las decisiones sobre casos omitidos; se ejecutan las pruebas afectadas.

## Evidence

Scope: the chatbot-side Coding Agent Client (client assembly, BFF routes and
worker stub). The worker's own RPC parsing, artifacts server, sessions and
extensions are tickets 10 and 11 and are not re-inventoried here.

### Guarantees by boundary

| Guarantee | Boundary | Active test | What a browser adds |
| --- | --- | --- | --- |
| Sidebar project tree, one project open at a time, route highlight, session creation and navigation intent | UI, jsdom | `tests/unit/agent-code/agent-code-section.test.tsx` | Next.js routing to `/agent/code/<project>/<sessionId>` and the rendered session page (`agent-code.spec.ts`) |
| Session row creation, label from first prompt, detached initial run, row cleanup on failure | Feature + PGlite | `tests/unit/agent-code/create-session-initial-prompt.test.ts` | Nothing (not an E2E) |
| Send opens a turn, user message renders, structured attachments and thinking level travel with the prompt | Client hook + BFF run route + worker HTTP seam (MSW) | `use-coding-agent.lifecycle.test.tsx`, `use-coding-agent.ssr-seed.test.tsx`, `run-route-attachments.test.ts`, `run-route-thinking-level.test.ts` | Real composer submit (loading spinner vs `type="submit"`), real streamed answer in the transcript (`agent-code.spec.ts`) |
| AG-UI relay: cursor events, terminal-event suppression, duplicate-terminal tolerance, steering CUSTOMs | Bridge route boundary | `agui-stream-relay.test.ts`, `connect-route.test.ts` | Nothing (protocol logic, no browser value) |
| Mid-run reconnect through the routes: status `running: true` while active, resume from `afterSeq` after a dropped attachment without replaying delivered events, `running: false` after `RUN_FINISHED` | BFF status + connect routes + worker HTTP seam | `tests/unit/agent-code/mid-run-reconnect-route.test.ts` | Nothing: the same handlers run in process |
| Reload keeps the session and the cookie-authenticated status endpoint answers for it | Browser page lifecycle | `tests/e2e/agent-code/reconnect.spec.ts` | Real reload, Next.js page render and browser cookie jar |
| Client reconnect triggers: visibilitychange, pagehide/pageshow, freeze/resume, focus, online, backoff (4 attempts then error), deliberate-abort silence | Client hook, jsdom + MSW | `use-coding-agent.lifecycle.test.tsx`, `use-coding-agent.ssr-seed.test.tsx` | Nothing deterministic this ticket can add; jsdom synthesizes the events |
| Mid-turn duality: follow-up enqueue vs second run, steering as transcript bubble, chip edit/discard/promote, cancel drains pending, mid-turn validation errors | UI + BFF queue routes | `agent-code-chat-guards.test.tsx`, `agent-code-chat-followup.test.tsx`, `agent-code-chat-chip-actions.test.tsx`, `agent-code-chat-cancel.test.tsx`, `agent-code-chat-midturn-validation.test.tsx`, `use-coding-agent.guards.test.tsx` | Nothing (component/hook collaboration is real) |
| Pending queues rehydrated from the snapshot after a reload, raw queue-update events, verbatim worker rejection | Client hook + snapshot payloads | `agent-code-chat-rehydration.test.tsx`, `use-coding-agent.rehydration.test.tsx`, `pending-queues.test.ts` | Nothing (reload is simulated with the same snapshot the server sends) |
| Tool-call grouping: pair results by id, drop orphans, preserve order, ok/error/running per timing | Pure helper | `group-items.test.ts` | Nothing |
| One rendered group per tool call with non-empty summary | UI, jsdom | `tool-call-group.test.tsx`, `tool-call-detail.test.tsx`, `tool-summary.test.ts` | Streamed stub events become mounted DOM groups (`tool-call-grouping.spec.ts`); the relay + memoized grouping + transcript path is not exercised in jsdom |
| Worker JSON-RPC client (initialize, model, skills, subagent, no attachment payloads) | Bridge → worker HTTP seam | `worker-client.test.ts`, `worker-client-subagent.test.ts` | Nothing (not an E2E) |
| `ConnectableHttpAgent` run/connect/abort/reset, reasoning/text messageId collision | Client transport seam | `connectable-http-agent.test.ts`, `reasoning-text-collision.test.ts` | Nothing |
| Session model, thinking level, skills, prompts routes and hooks, SSR seed | BFF + hooks | `model-route.test.ts`, `thinking-level-route.test.ts`, `prompts-route.test.ts`, `use-coding-agent-session-model.test.tsx`, `use-coding-agent-thinking-level.test.tsx`, `use-coding-agent-skills.test.tsx`, `use-coding-agent-prompts.test.tsx`, `use-coding-agent.ssr.test.tsx`, `use-coding-agent.ssr-seed.test.tsx` | Nothing (BFF/hook contracts) |
| File browser, deep links, diff parsing, markdown preview comments, turn files, subagent views | UI + pure helpers | `file-browser-deep-link.test.ts`, `file-links.test.ts`, `git-diff-parse.test.ts`, `markdown-preview*.test.tsx`, `markdown-to-session-modal.test.tsx`, `code-view-frame.test.tsx`, `agent-response.test.tsx`, `turn-files.test.ts`, `subagent-session-view.test.tsx`, `subagent-tool-link.test.tsx` | Nothing |
| Chatbot adapter wired to the worker's public translator export | Package boundary | `pi-to-agui-translator.test.ts` (chatbot side); worker side under `packages/coding-agent/tests/unit/pi-to-agui-translator.test.ts` | Nothing |

No consolidation removed coverage: the apparent duplicates protect different
boundaries (pure grouping rules vs. rendered group; hook-level send vs.
component-level composer gate; BFF route vs. client hook). The worker stub and
the PGlite/MSW seams make every unit test above self-contained, with real
first-party collaborators by default.

### Stub boundary

The chatbot E2Es never talk to a real worker. `packages/config/src/config.test.ts`
pins `codingAgentWorkerUrl` to `http://localhost:3001/api/agent/code/worker-stub`,
asserted by [`packages/config/tests/unit/env-bundles.test.ts`](../../../packages/config/tests/unit/env-bundles.test.ts)
and [`packages/coding-agent/tests/unit/runtime-paths.test.ts`](../../../packages/coding-agent/tests/unit/runtime-paths.test.ts).
The stub route returns 404 outside the Test Environment; no E2E opens `:3015`
or `:3016`.

Stub limits, stated where they matter: `getSessionStatus` always answers
`running: false`; `getSessionSnapshot` returns empty messages and cursor 0;
`getSessionModel` returns `null`; `connectToSession` replays a fixed three-event
run regardless of `afterSeq`; tool events only exist for prompts containing
`list files`; the catalog advertises only the two Gateway ids `basicChat` and
`canExecuteTools` (commit 7de02476 replaced the previous invented stub ids
`opencode-go/deepseek-v4-pro` and `kimi-k2.7-code`: model identity now comes
from the Model Gateway catalog, and the send control enables only for catalog
ids). A real chatbot↔worker connection — with its sessions,
attachments, skills and mid-run replay — stays outside this migration (spec
§out of scope).

### Decisions on the three previously skipped cases

Historically skipped in `4eebdac7`, all three targeted the `/agent/code`
landing removed in `549e8f5`; the only obsolete part was the entry route, not
the behavior.

- **Session/send** — Restored against the sidebar in `7de02476` and kept as an
  E2E. The journey (project tree → new session → Next.js route → composer →
  stub stream) is the browser-only part; its unit counterparts cover the tree
  and the send without routing. No supported behavior was dropped.
- **Reconnect** — The historical assertion (`running: false` for a fresh
  session) is a stub limitation, not a mid-run guarantee. It is kept as a
  reload/navigation E2E with that limit stated in the spec, and the supported
  mid-run guarantee was restored where it actually lives: the route boundary
  (`mid-run-reconnect-route.test.ts`, `3679116b`) plus the hook-level browser
  lifecycle suite. Nothing regressed and nothing is claimed that the stub
  cannot show.
- **Tool-call grouping** — Restored with the same intent in `7de02476`. Grouping
  rules and group rendering are unit-tested; the E2E is retained only for the
  stream-to-DOM path. The spec now names those equivalents.

Every retained E2E states what browser behavior it verifies and what a unit
test would omit (comments in each of the three spec files, extended in this
ticket). No skipped or fixme case remains under
`packages/chatbot/tests/e2e/agent-code` or `packages/coding-agent/tests`; the
remaining skips in the repository belong to tickets 02 (conditional bundle
check) and 06 (Project creation, Test Chat and per-model settings).

### Commands run

| Command | Result |
| --- | --- |
| `grep -rn "skip\|fixme" packages/chatbot/tests/e2e/agent-code packages/coding-agent/tests` | No skipped/fixme cases in scope (only the word "skips" in three test titles) |
| `pnpm exec vitest run tests/unit/agent-code` (chatbot) | 65 files, 371 tests passed |
| `pnpm exec vitest run tests/unit` (coding-agent) | 36 files, 313 tests passed |
| `pnpm --filter chatbot lint` | Passed |
| `pnpm --filter chatbot type:check` | Passed |
| `pnpm --filter coding-agent lint` | Passed |
| `pnpm --filter coding-agent type:check` | Passed |

### Validation limits

- Playwright E2E was **not** executed (deferred to ticket 16, per the ticket
  instructions); the browser guarantees above are stated from the specs and
  their unit counterparts, not from a green browser run.
- No build (`build:verify` or Production) was run for this ticket; the
  worktree needed `pnpm install --offline` and the gitignored
  `packages/config/src/secrets.{dev,prod}.ts` to execute Vitest at all. Neither
  file is tracked.
- No operator decision is open: the reuse of the stub and the restoration of the
  three cases follow the spec, and no supported behavior was proposed for
  removal.
