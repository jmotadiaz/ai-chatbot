# 02: Chat Mode `auto` end-to-end (sin router real)

**What to build:** agregar `auto` como Chat Mode nuevo y default de chats nuevos, con provenance en metadata y badge en la UI, y una resolución stub `auto → context7` para cerrar todo el camino (DB, selector, stream, persistencia, badge) sin llamar todavía a OpenRouter.

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] `auto` es el primer valor de `CHAT_MODES`; `ResolvedChatMode = "context7" | "web" | "neutral"`; `auto` se añade al pgEnum y pasa a ser default en la columna `Chat.chatMode` y en los fallbacks de handlers/UI/hooks.
- [ ] `ChatModeSelector` muestra "Auto" (primera opción, con icono) y es lo que aparece por defecto en chats nuevos; ctx7, web y rag siguen seleccionables.
- [ ] `ChatModeRouterPort` + `resolveChatMode()` en `lib/features/chat/mode-routing/`, con stub que devuelve `{ mode: "context7", reason: "fallback", modelId: "stub" }`; fake determinista en `isTestMode()`.
- [ ] `makeProcessChatResponse(compactionAi, modeRouter)` compone el router; la resolución corre una vez por turno solo cuando `chatMode === "auto"` y no hay `projectId`.
- [ ] `MessageMetadata.chatModeRouting` se emite en el `start` del mensaje y se persiste con él (sobrevive a recarga).
- [ ] Badge expandible en el mensaje (patrón "Router Details") con modo y reason.
- [ ] Chats existentes conservan su modo; modos explícitos no pasan por el router; chats de proyecto intactos.
- [ ] Suites rápidas del repo en verde (lint, type-check, tests afectados).

## Comments
