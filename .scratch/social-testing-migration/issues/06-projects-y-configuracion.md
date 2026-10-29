# 06: Migrar Projects y configuración de modelo

**What to build:** Proteger creación, gestión y Chats de Project con la
frontera adecuada, y resolver los escenarios omitidos de configuración sin
confundir comportamiento obsoleto con garantías aún vigentes.

**Blocked by:** 01: Preparar la transición y migrar Compaction.

**Status:** done — with two open operator questions (§ Open operator questions).

- [x] Se inventarían los tests de creación, gestión, Chat y configuración de Project y se conservan sus garantías funcionales mediante cobertura equivalente demostrada.
- [x] Se revisan los casos omitidos de configuración avanzada, Test Chat y ajustes por modelo, incluida la vigencia de la garantía de temperatura.
- [x] Los escenarios soportados sin cobertura se restauran en la frontera adecuada; los elementos obsoletos se eliminan solo con justificación y las dudas funcionales se consultan al operador.
- [x] Los E2E retenidos explican la garantía de navegador y lo que omitiría un test unitario; los casos restantes se prueban socialmente cuando sea fiel.
- [x] Se registran las decisiones y equivalencias en los comentarios y se ejecutan los tests afectados.

## Evidence

### Suite inventory (Projects, settings, Test Chat)

The whole Playwright suite was re-discovered with
`grep -rn "test.skip|test.fixme|test.todo" packages/chatbot/tests/e2e`:
only the three cases below plus the six active Projects/settings cases exist.

| Area | Case | State | Guarantee |
| --- | --- | --- | --- |
| Projects/creation | 1.1 Create Valid Project with Basic Settings | active | Draft `/project/<newId>/add` → save activates it, redirects to `/project/<id>/chat`, sidebar shows the title |
| Projects/creation | 1.2 Create Project with Advanced Configuration | `test.skip` → **removed** | Advanced temperature persisted on creation; RAG pill hidden in a project chat (web-search steps already commented out) |
| Projects/management | 2.1 Edit Existing Project | active | Edit route, save redirects to chat, sidebar reflects the renamed project |
| Projects/management | 2.2 Delete Project | active | Sidebar delete action + confirmation modal removes the project from the sidebar |
| Projects/chat | 3.1 Standard Project Chat | active | Project persisted chat route, message POST, streamed reply rendered |
| Projects/chat | 3.2 Temporary Project Chat | active | `chatType=temporary` URL and non-persistence after navigating away and back |
| Projects/chat | 3.3 "Test Chat" in Configuration View | `test.fixme` → **kept, documented** | Switching tabs and sending from the Test Chat panel of the configuration view |
| settings | should allow modifying chat settings for different models | `test.fixme` → **re-enabled** | Selected model's temperature in the settings popup (0.6), edited value, and reset to 1 after switching model |

### Guarantee → boundary → test → decision

| Guarantee | Boundary | Test | Decision |
| --- | --- | --- | --- |
| Create project: advanced temperature reaches persistence | Component (real `ProjectForm`, real `InputNumber`, MSW-free server action at the boundary) | `tests/unit/project/project-form.test.tsx` → "persists the temperature raised in the Advanced panel" (0.6 + 2×0.1 → `updateProject` gets `defaultTemperature: 0.8`) and "leaves the advanced settings unset while Advanced stays closed" | Restored social coverage for the supported part of case 1.2 |
| Create project: advanced fields (model, topP, topK, temperature, tools) are validated and stored | Social unit (PGlite + real actions/queries; only session and `revalidatePath` substituted) | `tests/unit/project/project-actions.test.ts` → `createProject` advanced settings, validation table, ownership | Existing coverage; keeps the guarantee behind 1.2 |
| Create project: redirect to the new project chat and sidebar listing | E2E (browser) | `tests/e2e/chat/projects/creation.spec.ts` → 1.1 (browser comment added) | Retained: routing, redirect and layout refresh cannot be proven by a unit test |
| RAG pill is hidden in a project chat | Component (real `ActiveToolsPill`) | `tests/unit/project/active-tools-pill.test.tsx` | Existing coverage; the removed 1.2 assertion is covered here |
| Web-search toggle/results in the advanced panel | Removed UI | — | The controls no longer exist (Tools section only renders Refine Prompt; the commented E2E steps said "Web search removed"). Partially obsolete → removed with the case; see the open question about `webSearchNumResults` |
| Edit project and see the refreshed sidebar | E2E (browser) | `management.spec.ts` 2.1 (browser comment added); persistence rules in `project-actions.test.ts` | Retained: routing and `router.refresh()` re-fetch |
| Delete project from the sidebar + modal | E2E (browser) | `management.spec.ts` 2.2 (browser comment added); deletion rules in `project-actions.test.ts` | Retained |
| Standard project chat round trip | E2E (browser) | `chat.spec.ts` 3.1 (browser comment added) | Retained: project chat route + browser stream assembly |
| Temporary project chat is not persisted | E2E (browser) | `chat.spec.ts` 3.2 (browser comment added) | Retained: real routing lifecycle is the risk |
| Test Chat in the configuration view sends the draft configuration | Component (real `ProjectForm` + `ChatProvider`, MSW at `/api/chat`) | `tests/unit/project/project-form.test.tsx` → "ProjectForm Test Chat" (catalog temperature 0.6, draft temperature 0.8, `preventChatPersistence`, no `chatId`) | Social replacement for 3.3; the E2E keeps its `test.fixme` (hydration) and now points at it |
| Temperature per model: the picker applies the catalog temperature and a switch resets an edited value; the request sends it | Component (real `ChatProvider` + `useModelPicker`, MSW at `/api/chat`) | `tests/unit/chat/model-switch-config.test.tsx` | Social replacement for the settings fixme; guarantee is still supported (`temperature` in the catalog and `use-handle-project-form`/`ChatProvider`) |
| Rendered settings popup round trip (picker → settings → edited value → switch) | E2E (browser) | `settings.spec.ts` (re-enabled, comment explains the browser risk and the social coverage) | Re-enabled: the strict-mode cause was the deleted static catalog ("MiniMax M3" twice) plus an unanchored option name; the Mock Model Gateway ids are unique and `getModelOption` anchors `^<id>\s+I:`. Same selector is active in `seed.spec.ts`, `attachments.spec.ts` and `resume.spec.ts` |

### Skipped-case resolutions

1. **`creation.spec.ts` 1.2 (advanced configuration) — removed as a case, not as
   coverage.** The commented web-search steps ("Web search removed" / "Web
   Search config removed") prove half the case was obsolete: the form has no
   web-search or RAG control, only Refine Prompt, plus Temperature/Top P/Top K.
   Of the rest, the redirect and sidebar assertions duplicated 1.1, the RAG pill
   is covered by `active-tools-pill.test.tsx`, and the advanced-field
   persistence is covered by `project-actions.test.ts`; the only gap was the
   form wiring, now covered by the two `project-form.test.tsx` save cases. Per
   ADR 0013 (representative journeys, not input matrices) the duplicated
   creation journey is not kept.
2. **`chat.spec.ts` 3.3 (Test Chat in the configuration view) — kept as
   `test.fixme`.** The behavior is now covered socially, so the guarantee is not
   lost; the remaining E2E value is the real tab-panel hydration that is itself
   the flaky part. No hydration fix was attempted without evidence. Ticket 16
   must re-enable it after fixing the wait or delete it, accepting the social
   test as the coverage.
3. **`settings.spec.ts` (settings per model) — re-enabled.** Deterministic
   selector failure, not flakiness: its stale cause no longer exists (see the
   table). The guarantee is also covered socially, so the case cannot lose
   protection if it fails.

Retained E2E cases now state, in their own comments, what a real browser
verifies and what a unit test would omit (1.1, 2.1, 2.2, 3.1, 3.2, settings).

### Commands and results

```
pnpm --filter chatbot vitest run tests/unit/project tests/unit/chat/model-switch-config.test.tsx
  → 4 files, 24 tests passed
pnpm --filter chatbot test:unit
  → 121 files, 788 tests passed (self-contained profile)
pnpm --filter chatbot eslint tests/unit/project tests/e2e/chat/projects tests/e2e/chat/settings.spec.ts
  → clean
pnpm --filter chatbot type:check
  → tsc --noEmit clean
```

The worktree had no `node_modules` and lacked the gitignored
`packages/config/src/secrets.{dev,prod}.ts`, so dependencies were installed with
`pnpm install --frozen-lockfile` and those local-only secrets were copied from
the main checkout to let Vitest load `vitest.config.ts`. No repository file
tracks them and Production was not touched.

### Validation limits

- **Playwright was not run** (deferred to ticket 16 per ticket 06). The retained,
  removed and re-enabled cases have not been executed in a browser; the
  re-enabled settings case in particular must be confirmed by ticket 16.
- No build (neither `build:verify` nor Production), no bundle inspection, no
  infra profile, no E2E run.
- The social tests substitute only the session/`revalidatePath` boundary (server
  actions), the routing module and the Model Gateway HTTP seam; they do not
  prove browser routing, redirects or hydration.

## Open operator questions

1. **Web search in the project advanced configuration.** The form no longer has
   a web-search control, yet `use-handle-project-form` still persists
   `webSearchNumResults` (the default when Advanced is open), the Project schema
   keeps the field and `project-actions.test.ts` covers it. Was removing the
   control intentional (the E2E said "Web search removed") and the persisted
   field is only legacy plumbing, or should the control come back? Ticket 06
   treated the control as obsolete and removed the E2E; no code or schema was
   deleted.
2. **E2E 3.3 after the hydration fix.** Once the Test Chat tab wait is fixed,
   is a browser test still wanted on top of `project-form.test.tsx`, or can the
   social coverage be accepted? Ticket 06 kept the case as `test.fixme` and left
   the decision to the final E2E pass.
