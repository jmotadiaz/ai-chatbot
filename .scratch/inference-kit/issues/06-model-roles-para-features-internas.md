# 06: Model Roles para las features que hoy nombran modelos por id

**What to build:** título de chat, extracción de memoria y descomposición de queries, resumen de búsqueda web, edición de imagen, meta-prompt, workflows de english y compaction obtienen su Model Configuration por Model Role a través del kit (`languageModel(role)` o `createAgent(role, …)`), en lugar de por id literal. Cambiar el modelo de cualquiera de esos roles es una edición de `MODEL_ROLES` en el Model Catalog. El comportamiento de cada feature no cambia.

**Blocked by:** 02 (kit con resolución por id).

**Status:** ready-for-agent

- [x] `MODEL_ROLES` en `models` cubre los roles internos que hoy se nombran por id: título de chat, extracción de memoria, descomposición de queries de memoria, resumen de búsqueda web, edición de imagen, meta-prompt (sus tres usos), los pasos de los workflows de english y el modelo de compaction. Cada rol apunta a un id existente en `MODEL_CATALOG`; los roles no son seleccionables desde la UI.
- [x] El kit acepta rol o id en `languageModel` y expone `createAgent(idOrRole, { instructions, tools, overrides })` que devuelve un `ToolLoopAgent` con el modelo trazado cuando el tracing está activo, cubriendo el patrón repetido en los Chat Modes. **Nota (pendiente de code review):** `createAgent` está expuesto y unit-testeado (`packages/inference/tests/unit/create-agent.test.ts`), pero no se adopta dentro de los Chat Modes: `ChatAgentAiPort` (`lib/features/chat/conversation/factory.ts#buildAgentAdapter`) les entrega una `ModelConfiguration` ya resuelta y ya trazada del modelo seleccionado por el usuario, y `context7.ts` construye un `Context7Agent` (`new Context7Agent(...)`, de `@upstash/context7-tools-ai-sdk`), no un `ToolLoopAgent` del kit. Ninguno de los dos sitios encaja con la forma de `createAgent` sin cambiar puertos/comportamiento, fuera del alcance de 06.
- [x] Las features listadas migran a rol; ninguna de ellas contiene un id literal de modelo. Los Chat Modes seleccionables siguen recibiendo el id del usuario.
- [x] Unit del paquete: invariante de catálogo (cada rol resuelve a una entrada existente) y resolución por rol devuelve la misma configuración que por id.
- [x] Los tests de configuración por modelo existentes siguen pasando; los tests de las features migradas no cambian de aserciones.
- [x] `pnpm verify:fast` en verde; `pnpm build:verify` compila.

## Comments

### 2026-09-24 — merged

- Merge commit: `3fbd4c02` (`merge: ticket 06 — Model Roles for the internal features`, into `feat/inference-kit`).
- Implementer commits merged (`git log --oneline 9726aa90..inference-kit/06-model-roles`):
  - `3a70b9f8` feat(models): add Model Roles for internal language and speech call sites
  - `f78c24a5` feat(inference): accept Model Roles in languageModel; add createAgent and speechModel
  - `75a0dda2` refactor(chatbot): migrate internal features to Model Roles; move TTS behind the kit
  - `a625a2a0` fix(chatbot): keep compaction's persisted modelUsed as a catalog id, not a role
- Verified in the integration worktree: clean `--no-ff` merge (no conflicts, as expected — 06 branched from ticket 02's tip and only ticket-closing commits landed on integration since); `pnpm install --frozen-lockfile` (lockfile already up to date); `pnpm verify:fast` green (lint + type:check + unit/component/integration/contract, all packages); both `build:verify` compile steps green — `pnpm --filter coding-agent build:verify` (`dist/verify` + `.pi-verify/models.json`) and the chatbot `next build` with `NEXT_BUILD_DIR=.next/verify` (confirmed `packages/chatbot/.next/verify` exists afterwards).
- Judgment calls / notes for reviewers:
  - `webSearchUrlIntent` is the URL-intent classifier `hasContextUrls` in `lib/features/web-search/utils.ts` (the only model call under web-search).
  - Text-to-speech moved behind the kit via `SPEECH_MODELS`/`SPEECH_ROLES` (`packages/models/src/speech-catalog.ts`) + `speechModel(role)` on the kit — an orchestrator decision (`09-orchestrator-decisions.md`), needed for ticket 07's lint rule (no provider SDK imports/literal ids outside the kit).
  - `SPEECH_ROLES` is part of the flat `MODEL_ROLES` (`packages/models/src/roles.ts`: `{ ...LANGUAGE_MODEL_ROLES, ...SPEECH_ROLES }`).
  - `ChatSummary.modelUsed` keeps recording the resolved catalog id, not the role name (commit `a625a2a0`).
  - The root `AGENTS.md` inference paragraph was touched (documents `languageModel`/`createAgent` accepting a Model Role and the new `speechModel`).

### 2026-09-24 — code review: pending note resolved

The "pendiente de code review" note above (checkbox 2: `createAgent` exposed but not adopted in the
Chat Modes, `context7.ts` outside its shape) is resolved. `ChatAgentAiPort`
(`packages/chatbot/lib/features/chat/conversation/ports.ts`) now exposes `getModelConfiguration()`
plus `createAgent(options)`; `neutral.ts`/`project.ts`/`rag.ts`/`web-search.ts` build their agent via
`ai.createAgent(...)` instead of `new ToolLoopAgent({...modelConfiguration, ...})`, and
`chat-modes/factory.ts` just passes the port through instead of resolving a config per mode.
`context7.ts` stays outside `createAgent` as anticipated (`Context7Agent` is a different, third-party
class), but now gets its traced Model Configuration from the kit's new `createAgentModel` — a small
operation split out of `create-agent.ts` alongside `createAgent` (`packages/inference/src/kit.ts`,
`src/types.ts`) — instead of `conversation/factory.ts` calling `wrapWithTracing`/`isTracingEnabled`
by hand, which was the last non-kit tracing call site in the chatbot. Commit
`f002df6a` (`refactor(chatbot,inference): adopt createAgent in the Chat Modes`). No behavior change:
same model, same parameters, same tracing when `TRACE_ENABLED=1`, same agent settings per mode.
