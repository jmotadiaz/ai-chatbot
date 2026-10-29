# 16: Verificar y cerrar la migración

**What to build:** Demostrar que el conjunto migrado cumple la spec y el
ADR 0013, con un inventario trazable y verificación integral que no afecte a
Production.

**Blocked by:** 02: Hacer fiable la inspección del bundle; 03: Separar las evaluaciones de calidad; 15: Completar comandos y retirar la organización anterior.

**Status:** ready-for-agent

- [x] Se consolida la contabilidad de garantías de los tickets: para cada garantía funcional activa anterior existe cobertura equivalente o una decisión explícita del operador; las eliminaciones de detalles internos están justificadas. — Ver § Final guarantee inventory.
- [x] Se redescubren y revisan todos los E2E y skips actuales; cada E2E conservado justifica la necesidad de navegador y cada caso omitido tiene una resolución o decisión explícita. — Ver § E2E inventory; el único `test.fixme` restante depende de la pregunta abierta (b).
- [x] Se comprueba que las capacidades y paquetes de la spec están incluidos y que las evaluaciones permanecen fuera del comando unitario sin cambios silenciosos de semántica. — Ver § Evaluaciones.
- [x] Se validan selección por paquete y archivo, perfil autocontenido, perfil aprovisionado, propagación de fallos y verificación del bundle recién generado. — Ver § Final verification, comandos 3, 5 y 9–13.
- [x] Se ejecutan las comprobaciones pertinentes de lint, tipos, tests unitarios y de recursos aprovisionados, E2E y build de verificación aislado; se informa de cualquier prerrequisito o cobertura no ejecutada. — Ejecutadas todas; los fallos E2E reales se reportan sin corregir código de producto (§ E2E results, § Validation limits).
- [x] La documentación refleja el estado implementado, no la transición; no se ejecutan builds de Production, evaluaciones con proveedores reales ni acciones sobre servicios o datos de Production. — Ver § Documentation.

## Final guarantee inventory

Consolidado de las secciones "Evidence"/"Evidencia" de los tickets 01–15 contra el
árbol actual. Cobertura = test que hoy protege la garantía funcional (rutas
relativas a cada paquete). "Decisión" solo cuando no hay cobertura activa.

### Operator questions (surfaced, NOT decided here)

1. **Ticket 06 — web-search legacy plumbing in the project form/schema/tests.**
   The Advanced panel no longer renders a web-search control, yet
   `use-handle-project-form` still persists `webSearchNumResults`, the Project
   schema keeps the field and `tests/unit/project/project-actions.test.ts`
   covers it. Is that intentional legacy plumbing, or should the control return?
   No code or schema was changed.
2. **Ticket 06 — keep or drop E2E 3.3 "Test Chat" in Configuration View.**
   `packages/chatbot/tests/e2e/chat/projects/chat.spec.ts` still carries
   `test.fixme` (hydration). Its guarantee is covered socially by
   `tests/unit/project/project-form.test.tsx` ("ProjectForm Test Chat"). Does the
   operator want the browser case re-enabled (after fixing the hydration wait) or
   deleted, accepting the social test as the coverage? Ticket 16 did not decide
   it; the skip remains and is documented in `tests/e2e/README.md`.
3. **Ticket 01 — single-Message compaction cut-point (already resolved).**
   The operator accepted the current behaviour (`cutIndex` 0: an oversized single
   Message is summarized and none kept) and the title now says
   "summarizes a single message that exceeds the threshold and keeps none"
   (`tests/unit/compaction/cut-point.test.ts:37`). Recorded here for traceability;
   any future change needs a new explicit decision.

### Compaction (ticket 01)

| Previously active guarantee | Current coverage | Decision |
| --- | --- | --- |
| Summary persisted with `modelUsed`, `messageId`; `reasoning-default` over HTTP | `chatbot/tests/unit/compaction/compaction-flow.test.ts` | — |
| Empty chat and abort signal generate no inference/summary; summarization failure persists nothing | same file | — |
| `reasoning-default`/`vision-default` contract, temperature 0.1, initial/incremental prompt, turn prefix, Gateway error propagation | `chatbot/tests/unit/compaction/summary-generation.test.ts` | — |
| Compaction threshold boundary | `chatbot/tests/unit/compaction/should-compact.test.ts` | — |
| Token estimation (chars/4, 4800/file, provider usage) | `chatbot/tests/unit/compaction/token-estimation.test.ts` | — |
| Serialization (prefixes, reasoning, files, 2000-char truncation) | `chatbot/tests/unit/compaction/serialize-messages.test.ts` | — |
| Cut point between whole messages | `chatbot/tests/unit/compaction/cut-point.test.ts` | Single-Message case: operator decision 3 |

### Chat Mode and conversation (ticket 04)

| Previously active guarantee | Current coverage | Decision |
| --- | --- | --- |
| `chatMode=auto` + `chatModeRouting` persisted; explicit modes not routed; project chats not routed; Decisions failure falls back and persists | `chatbot/tests/unit/chat/mode-routing/persistence-and-routing.test.ts` | — |
| `neither` turn without tools; transport error, invalid answer, timeout, low confidence, answer without confidence | `chatbot/tests/unit/chat/mode-routing/neutral-branch.test.ts` | — |
| HTTP router call/mapping/provenance/errors; fallback policy; pure decision mapping | `create-chat-mode-router.test.ts`, `resolve-chat-mode.test.ts`, `decide-resolved-mode.test.ts` | — |
| Mode selector and routing badge rendering | `chatbot/tests/unit/chat/mode-routing/chat-mode-ui.test.tsx` | — |
| Mode composition (tools, instructions, memory, project RAG) and agent parameters/tool loop | `chatbot/tests/unit/chat/chat-modes/*.test.ts` | — |
| Poisoned tool history deduplication | `chatbot/tests/unit/chat/conversation/poisoned-tool-history.test.ts` | — |
| Conversation POST route persistence/resume registry | `chatbot/tests/unit/chat/resume/post-route-resume-persistence.test.ts` | Moved from `tests/contract/` |

### Hub, sidebar, history (ticket 05)

| Previously active guarantee | Current coverage | Decision |
| --- | --- | --- |
| Hub instance limit, locking/fan-out, empty input, persisted deletion, in-flight persistence | `chatbot/tests/unit/chat/hub/use-chat-hub.test.tsx` | — |
| Root chat/transcript persistence and authorization | `chatbot/tests/unit/chat/hub/persist-hub-chat.test.ts` | — |
| History: root-only, user isolation, ordering, search, pagination, session-bound limits | `chatbot/tests/unit/chat/history/history-chats.test.ts` | — |
| Sidebar ordering and pinning without changing recency; unauthorized no-op | `chatbot/tests/unit/chat/sidebar/sidebar-chats-and-pin.test.ts` | — |
| Browser risks (grid geometry, parallel streams, drawer refresh, routing, infinite-scroll geometry, modals) | E2E `chat/hub.spec.ts` (5), `chat/hub-sidebar-update.spec.ts` (1), `chat/sidebar.spec.ts` (5), `chat/history.spec.ts` (9) | Retained; each spec now states its browser rationale |

### Projects and model configuration (ticket 06)

| Previously active guarantee | Current coverage | Decision |
| --- | --- | --- |
| Create/edit/delete project; advanced settings validated and persisted; ownership | `chatbot/tests/unit/project/project-actions.test.ts`, `project-form.test.tsx` | — |
| Advanced temperature reaches persistence; unset while Advanced is closed | `chatbot/tests/unit/project/project-form.test.tsx` | Restored for case 1.2 |
| RAG pill hidden in a project chat | `chatbot/tests/unit/project/active-tools-pill.test.tsx` | — |
| Creation/edit/delete journeys, project chat round trip, temporary (unpersisted) project chat | E2E `chat/projects/{creation,management,chat}.spec.ts` (1.1, 2.1, 2.2, 3.1, 3.2) | Retained; commented rationales |
| Test Chat in the configuration view sends the draft configuration | `tests/unit/project/project-form.test.tsx` ("ProjectForm Test Chat") | E2E 3.3 kept as `test.fixme` → operator decision 2 |
| Temperature per model: catalog value, edited value, reset on switch, request payload | `chatbot/tests/unit/chat/model-switch-config.test.tsx` | E2E `chat/settings.spec.ts` re-enabled with its browser rationale |
| Web-search controls in the advanced panel | — | Obsolete UI; case 1.2 removed. Persisted `webSearchNumResults` → operator decision 1 |
| Project creation advanced case (1.2) as an E2E | Removed | Justified: redirect/sidebar duplicated 1.1; RAG pill and persistence covered above; ADR 0013 forbids input matrices |

### Navigation and Background Generation (ticket 07)

| Previously active guarantee | Current coverage | Decision |
| --- | --- | --- |
| Initial scroll anchor, prev/next/bottom buttons computed from real geometry, wheel-driven anchor release | E2E `chat/navigation.spec.ts` (12 cases, 4 re-enabled) | Retained; spec comment states the browser rationale |
| Resume after a dropped fetch, reload re-attach, no replay, regenerate + reopen (client navigate and reload) | E2E `chat/resume.spec.ts` (5) + `chatbot/tests/unit/chat/resume/*` | Retained; the E2E states that only fetch interruption and visibility events are simulated |
| Background Generation interruption/visibility simulation | Covered inside the resume E2E | Described as simulated; does not claim OS suspension or screen-off |

### Attachments, Prompt Refiner, representative journey (ticket 08)

| Previously active guarantee | Current coverage | Decision |
| --- | --- | --- |
| Attachment menu rules for the selected model | `chatbot/tests/unit/attachment/attachments-control.test.tsx`, `attachment-utils.test.ts` | — |
| Refine action: hook behaviour and route contract | `chatbot/tests/unit/meta-prompt/prompt-refiner-hook.test.tsx`, `refine-prompt-route.test.ts` | — |
| Composer end-to-end wiring (providers, composer, hook, route) | `chatbot/tests/unit/chat/composer/chat-composer-wiring.test.tsx` | — |
| Attachment menu in the rendered page; refine + Undo interaction | E2E `chat/attachments.spec.ts`, `chat/refine.spec.ts` | Retained; comments state the browser rationale |
| Representative chat journey (session, POST, streamed DOM) | E2E `seed.spec.ts` | Retained as the only full assembly journey |

### Coding Agent Client (ticket 09)

All guarantees in the ticket table still resolve to their listed test files under
`chatbot/tests/unit/agent-code/` (UI/sidebar, session creation, send + BFF routes,
AG-UI relay, mid-run reconnect route, client reconnect triggers, mid-turn duality,
rehydration, grouping helpers/rendering, worker JSON-RPC client, transport,
session model/thinking/skills/prompts, file browser/diffs/preview, translator).
The three previously skipped cases are accounted for:

| Previously skipped case | Current coverage | Decision |
| --- | --- | --- |
| Session/send from the removed `/agent/code` landing | E2E `agent-code/agent-code.spec.ts` + `agent-code-section.test.tsx` | Restored against the sidebar |
| Reconnect (`running: false` for a fresh session) | E2E `agent-code/reconnect.spec.ts` (reload) + `mid-run-reconnect-route.test.ts` | Historical assertion kept as a stub limit; the supported mid-run guarantee lives at the route boundary |
| Tool-call grouping | E2E `agent-code/tool-call-grouping.spec.ts` + `group-items.test.ts`, `tool-call-group.test.tsx` | Restored for the stream-to-DOM path only |

The chatbot E2Es still use the in-app worker stub (`/api/agent/code/worker-stub`,
pinned by `config.test.ts`); no E2E opens a real worker. Stub limits are stated in
the specs.

### Worker RPC and artifacts server (ticket 10)

| Previously active guarantee | Current coverage | Decision |
| --- | --- | --- |
| RPC parsing in process: empty, non-JSON, `null`, missing `method` | `coding-agent/tests/unit/rpc/http-transport-parse.test.ts` | Kept in process; does not claim process survival over real HTTP |
| Artifacts HTTP server: routing, delivery, headers, HEAD, invalid/traversal paths, RPC coexistence | `coding-agent/tests/unit/artifacts/artifacts-server.test.ts` (real ephemeral port + temp sandbox) | — |
| Artifact location defaults | `coding-agent/tests/unit/runtime-paths.test.ts` | Redundant copy removed from the server suite |
| Configuration injected into the running process | `coding-agent/tests/unit/artifacts/artifacts-server.test.ts` | — |

### Worker sessions and extensions (ticket 11)

| Previously active guarantee | Current coverage | Decision |
| --- | --- | --- |
| Session registry, queries, transcript lookup, persistence, model selection, subagents, git state | `coding-agent/tests/unit/sessions/*` | — |
| Extension physical paths and resource loading | `coding-agent/tests/unit/extensions/pi-packages.test.ts`, `subagent-extension.test.ts` | Four duplicated path invariants consolidated here |
| Runtime factory injection | `coding-agent/tests/unit/sessions/session-file-lookup-disk.test.ts` (constructor injection) | `setRuntimeFactory` and its empty test removed (API change accepted by the operator) |

### Model Gateway (ticket 12)

| Previously active guarantee | Current coverage | Decision |
| --- | --- | --- |
| Catalog/service contracts and errors (Python) | `model-gateway/tests/unit/*` (56 tests) | — |
| Testing toolkit protocol, scenario composition, HTTP server | `model-gateway/js/tests/unit/*` (48 tests) | — |
| Deployment guard with uncommitted changes: interactive prompt and explicit override, temp repo | `model-gateway/tests/unit/test_deploy_guard.py` (equivalent `y` variant consolidated; uppercase/accent variants added) | No service deployed |

### Configuration, tracing, architecture (ticket 13)

| Previously active guarantee | Current coverage | Decision |
| --- | --- | --- |
| Frozen Environment bundles, argv selection, portable paths | `config/tests/unit/{env-bundles,argv,paths}.test.ts` | — |
| Build/preview gates, migration ordering, isolated verify outputs (chatbot) | `chatbot/tests/unit/scripts/{build-scripts,prod-build-gate}.test.ts` | — |
| Bundler Environment binding, output isolation, launcher compatibility, E2E DB guard | `chatbot/tests/unit/config/*.test.ts` | — |
| AI import boundaries; complete test discovery | `chatbot/tests/unit/architecture/{eslint-boundaries,test-profile-selection}.test.ts` | — |
| Worker build gate/serving safeguards; test Environment isolation | `coding-agent/tests/unit/{scripts/*,architecture/no-process-env-mutations.test.ts}` | — |
| Shared trace sink lifecycle | `tracing/tests/unit/trace-sink-registry.test.ts` | — |
| Historical assertions on obsolete script names/strings | — | Removed without replacement (spec decision; no automatic substitute) |

### Remaining chatbot capabilities (ticket 14)

| Previously active guarantee | Current coverage | Decision |
| --- | --- | --- |
| RAG ingestion/retrieval, chunking, rate limiting | `chatbot/tests/unit/rag/*` | — |
| Memory retrieval, extraction, deduplication, isolation | `chatbot/tests/unit/memory/memory.test.ts` | — |
| English Helper classifier, delimiters, grammar route, workflows | `chatbot/tests/unit/english/*` | — |
| Image generation public API and image adapter | `chatbot/tests/unit/image/generate-images.test.ts`, `infrastructure/gateway-image-model.test.ts` | — |
| Model catalog configuration/selection/client HTTP | `chatbot/tests/unit/model-catalog/catalog-client.test.ts`, `foundation-model/config.test.ts` | — |
| Chat Mode DB migration replay | `chatbot/tests/unit/db/chat-mode-migration.test.ts` | — |
| Known direct-coverage gaps (`ragFactory`, `generateSpeech`, RAG resource server actions, deployment-only migration entrypoint) | — | Not claimed as covered; unchanged from ticket 14 |

### Commands and taxonomy (ticket 15)

| Previously active guarantee | Current coverage | Decision |
| --- | --- | --- |
| One unit command covering every package + Python suite, selection by package/file | root `test:unit` chain; `packages/chatbot/vitest.config.ts`, `vitest.infra.config.ts` | Verified here (commands 3, 11, 12, 13) |
| Complete test discovery / single profile per file | `chatbot/tests/unit/architecture/test-profile-selection.test.ts` | — |
| Historical categories and scripts retired | — | Removed: `tests/{component,contract,integration}` and their scripts (no dependent tests left) |

## Final verification

Environment: main checkout `/home/javier/projects/ai-chatbot`, branch
`feat/model-gateway-testing-toolkit`, Node v24.14.0, pnpm 11.5.0, pytest 9.0.2.
Test resources used: docker PostgreSQL `:5434/test` (already listening), Next dev
server `:3001` (`--env=test --webpack`), Mock Model Gateway `:4001`, isolated
`build:verify` output. No `pm2` command, no `pnpm build`, no command touching
`:8085`, `:3015` or `:5435`, no `pkill`, no evaluations, no real model providers.

### Commands and results

| # | Command | Exit | Result |
| --- | --- | --- | --- |
| 1 | `pnpm lint` | 0 | 6 packages clean |
| 2 | `pnpm type:check` | 0 | 6 packages clean |
| 3 | `pnpm test:unit` | 0 | chatbot 127 files/828 tests, coding-agent 41/355, config 3/30, tracing 1/5, toolkit JS 4/48, Python `56 passed`; 0 skipped (`.next/verify` existed, so the bundle contract inspected) |
| 4 | `ss -tlnp \| grep 4001` after #3 | — | empty: the default profile binds nothing |
| 5 | `pnpm test:infra` | 0 | 1 file/22 tests; `:4001` released afterwards |
| 6 | `pnpm test:e2e` (first run) | 1 | 27 passed, 22 failed, 1 skipped. The Next dev server logged `Server is approaching the used memory threshold, restarting` twice; every failure after that point is `net::ERR_CONNECTION_REFUSED` |
| 7 | `pnpm test:e2e` (retry, dev server started by hand with its log captured) | 1 | 45 passed, 4 failed, 1 skipped — see § E2E results |
| 8 | Targeted retries on the warm server: project chat 3.1 alone; navigation prev/next alone; agent-code alone | 0 / 1 / 1 | 3.1 passed (31.1 s); navigation cases failed again (2/2, and again alone); agent-code failed again (route compile > 10 s) |
| 9 | `pnpm build:verify` | 0 | chatbot `.next/verify` + coding-agent `dist/verify` |
| 10 | `pnpm --filter chatbot verify:bundle` | 0 | `[verify:bundle] OK: 447 chunk(s) inspected against 6 literal(s); all chunks newer than the build start` |
| 11 | `pnpm --filter chatbot test:unit tests/unit/chat/resume/registry.test.ts` | 0 | 1 file / 37 tests (per-file selection) |
| 12 | `pnpm --filter chatbot test:unit tests/unit/does-not-exist.test.ts` | 1 | `No test files found, exiting with code 1` (a missing selection is not a success) |
| 13 | `pnpm --filter @ai-chatbot/model-gateway exec python3 -m pytest tests/unit/test_catalog.py -q` | 0 | single Python file, `26 passed` |
| 14 | `pnpm --filter chatbot lint` (after the spec/README edits) | 0 | clean |

`pnpm verify:full` was deliberately **not** run as one command (ticket 16 asks for
attributable components): its steps are #1, #2, #3, #5, #6, the coding-agent
`build:verify` (inside #9) and `verify:bundle` (#10). The chain in
`package.json` is unchanged.

### E2E inventory

`npx playwright test --list` → **50 cases in 16 files**: 49 active + 1 `test.fixme`.
Every retained spec now states, next to its `test.describe`, the browser behaviour
it verifies and what a unit test would omit (comments added in this ticket to
`attachments`, `history`, `hub`, `hub-sidebar-update`, `navigation`, `refine`,
`resume`, `sidebar`, `seed`; `agent-code/*`, `projects/*`, `settings` already had
them). `packages/chatbot/tests/e2e/README.md` was updated to state that rule and
the remaining skip.

| File | Cases | Retained browser risk |
| --- | --- | --- |
| `chat/navigation.spec.ts` | 12 | Real scroll geometry, anchor lock release, prev/next/bottom computed from positions |
| `chat/history.spec.ts` | 9 | Sidebar→history routing, infinite-scroll sentinel, delete/pin dialogs |
| `chat/sidebar.spec.ts` | 5 | Chat-to-chat routing, layout toggle, delete menu, rendered pin order |
| `chat/resume.spec.ts` | 5 | Dropped fetch, reload re-attach, client navigate, no replay |
| `chat/hub.spec.ts` | 5 | Grid geometry, parallel streams, picker at the limit, offline UI |
| `chat/projects/chat.spec.ts` | 3 (2 + 1 fixme) | Project chat routing/stream, temporary chat lifecycle |
| `chat/projects/management.spec.ts` | 2 | Edit/delete journeys and sidebar refresh |
| `chat/projects/creation.spec.ts` | 1 | Draft → save → redirect → sidebar title |
| `chat/settings.spec.ts` | 1 | Rendered picker + settings popup round trip (re-enabled) |
| `chat/attachments.spec.ts` | 1 | Picker → attachment menu with the image input |
| `chat/refine.spec.ts` | 1 | Composer refine + Undo |
| `chat/hub-sidebar-update.spec.ts` | 1 | Cross-component drawer refresh |
| `agent-code/*.spec.ts` | 3 | Sidebar→session route, reload cookie status, stream→DOM grouping |
| `seed.spec.ts` | 1 | Representative login/POST/stream/DOM assembly |

### E2E results (retry, warm server)

45 passed, 4 failed, 1 skipped (the `3.3` fixme). Running the same cases
individually on a warm server:

| Case | Result | Reading |
| --- | --- | --- |
| `projects/chat.spec.ts` 3.1 Standard Project Chat | failed cold, **passed alone (31.1 s)** | Cold webpack compile of `/project/[id]/chat` (12–27 s in the log) exceeds the test's 15 s heading wait with a freshly started dev server |
| `agent-code/agent-code.spec.ts` send | failed cold, failed alone | First compile/render of `/agent/code/[project]/[sessionId]` takes ~10 s and the case waits only 10 s for the URL |
| `navigation.spec.ts` prev navigate | failed alone (3/3 with repeats) | The pre-click assertions pass (`prev` visible, message 6 in viewport); the assertion after `clickPrev` never sees message 5 in the viewport |
| `navigation.spec.ts` next navigate | failed alone | Next button never becomes visible after the wheel-release + scroll-to-top sequence, although the identical precondition in "should show next button when last user message is below viewport" passed |

No product code and no E2E assertion was changed in ticket 16 (a test-code wait
added to the two navigation cases did not change the result and was reverted). The
two navigation cases need a dedicated diagnosis, outside this ticket's mandate, as
they are deterministic here while ticket 07 recorded 40/40 repetitions in its
worktree.

### Remaining skips and resolutions

| Skip | Where | Resolution |
| --- | --- | --- |
| Conditional client bundle contract | `chatbot/tests/unit/scripts/client-bundle-no-secrets.test.ts` (`describe.skipIf(!built)`) | Accepted design (ticket 02): it skips only when `.next/verify` is absent. In this run it executed (828 tests, 0 skipped) |
| E2E 3.3 Test Chat | `chatbot/tests/e2e/chat/projects/chat.spec.ts` (`test.fixme`) | Social replacement `tests/unit/project/project-form.test.tsx`; keep-or-drop is operator question 2 (open, not decided) |

No other skip, fixme or todo exists in `packages/*/tests` (grep for
`test.skip|test.fixme|test.todo|describe.skip`).

### Evaluations

`packages/chatbot/evals/` (cases, lib, scenarios, README) is the only eval harness;
no `*.test.ts` lives there. The root `test:unit` chain is explicit
(`chatbot → coding-agent → config → tracing → toolkit JS → Python`) and never
invokes `eval`, `evalite` or the eval runner. Ticket 03's move (commit `08bf301f`)
changed paths, `.gitignore` and docs only: `evalite.config.ts`, the runner command
(`--env=dev`) and the Model Gateway/Test Environment semantics are untouched, and
no evaluation was executed here.

### Documentation

Root `AGENTS.md` (commands, profiles, taxonomy), `packages/chatbot/tests/AGENTS.md`
(profiles, selection, layout contract), `packages/chatbot/tests/e2e/README.md`
(browser rationale rule, resources, remaining skip), `docs/model-gateway-testing-migration.md`
(moved paths) and `docs/adr/0013-…md` §Implementation status describe the
implemented state; no document points at `tests/{component,contract,integration}`
as an active structure. This ticket added the per-spec browser rationales and the
README skip note.

### Validation limits and findings

- Not executed: `pnpm verify:full` as a single command (deliberate, see above);
  evaluations; any real model provider; any real chatbot↔worker connection (the
  E2Es use the in-app stub); Production build, `pm2`, or anything on
  `:8085`/`:3015`/`:5435`.
- The Python suite is unit-level only (no real Gateway).
- Full E2E green is not achieved in this environment: 2 deterministic navigation
  failures and 2 cold-compile timeouts; the first full run also lost 22 cases to a
  Next dev-server memory-threshold restart. These are reported as-is, not fixed.
- The E2E infrastructure itself did work: docker DB, migrations, Mock Gateway
  `:4001`, session login, streaming and the `:3001` dev server.
- Finding (not touched): the untracked directory `tests/evals/traces/` at the repo
  root still holds ~55 MB of generated eval traces from before the ticket 03 move.
  It is not referenced by any current path and was left in place.
