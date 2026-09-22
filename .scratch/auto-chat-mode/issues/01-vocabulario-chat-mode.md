# 01: Vocabulario Chat Mode en código, UI y DB

**What to build:** renombrar al lenguaje de dominio *Chat Mode* toda la superficie del chatbot que hoy llama `agent` al modo, sin cambiar comportamiento: tipo y constantes, directorio y factory, selector y labels, campo del body de `/api/chat` y el enum/columna en DB (rename metadata-only).

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] `Agent` → `ChatMode` y `AGENTS` → `CHAT_MODES` en `lib/features/chat/types.ts`, con todas las referencias actualizadas (`handlers.ts`, `app/(chat)/api/chat/route.ts`, `createAgent`, hooks del hub, `conversation/*`, tests).
- [ ] `lib/features/chat/agents/` → `lib/features/chat/chat-modes/`; `createAgent` → `createChatModeAgent`.
- [ ] `components/chat/controls/agent-selector.tsx` → `chat-mode-selector.tsx`, `AgentSelector` → `ChatModeSelector`; labels sin sufijo "Agent" (`Ctx7`, `Web`, `RAG`).
- [ ] Body de `/api/chat`: campo `agent` → `chatMode` en `app/(chat)/api/chat/route.ts`, `handlers.ts`, hooks del hub y `tests/evals/lib/chatbot-client.ts`.
- [ ] DB: `agentEnum("agent")` → `chatModeEnum("chat_mode")` y `Chat.agent` → `Chat.chatMode`; migración Drizzle de rename (si `db:generate` no detecta los renames, editar el SQL a `ALTER TYPE "agent" RENAME TO "chat_mode"` / `ALTER TABLE "Chat" RENAME COLUMN "agent" TO "chatMode"`; nunca drop+add, sin pérdida de datos).
- [ ] Fuera del rename: el campo `agent` del contexto de tracing (compartido con el Coding Agent) y `DEFAULT_PROJECT_AGENT_PROMPT` se quedan como están.
- [ ] `pnpm db:dev:migrate` y `pnpm db:test:migrate` aplican limpio sobre datos existentes.
- [ ] Suites rápidas del repo en verde (lint, type-check, tests afectados).

## Comments
