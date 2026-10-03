# 01: El store guarda las PendingQueues crudas

**What to build:** en el hook `use-coding-agent`, el estado `pendingMessage: string | null` pasa a guardar las `PendingQueues` crudas del worker (`{ steering, followUp }`); el hook expone `pendingQueues` y mantiene `pendingMessage` como derivado (vía `pendingChipText`) para no romper el chip existente. El evento `queue_update` y la rehidratación (`snapshot.pending`, seed SSR y `loadSnapshot`) alimentan las colas crudas; `cancel()` sigue drenando y devolviendo el texto vía el derivado. Sin cambios visibles todavía: el chip se comporta igual.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] El store guarda `PendingQueues` crudas (una sola fuente: evento `queue_update` y `snapshot.pending` la alimentan igual)
- [ ] El hook expone `pendingQueues` y `pendingMessage` sigue derivando vía `pendingChipText` (chip intacto, tests existentes en verde)
- [ ] `cancel()` drena y devuelve el texto como draft igual que hoy
- [ ] Suites rápidas en verde: `pnpm type:check`, lint del paquete, tests unit/component de agent-code afectados

**Context pointers:**

- Spec: `.scratch/steering-transcript-feedback/spec.md` (decisión "Store").
- `packages/chatbot/lib/features/code/pending-queues.ts` — `pendingChipText`, `pendingQueuesOf`, `pendingMessageFromEvent` (el último pasa a devolver `PendingQueues | undefined`).
- `packages/chatbot/lib/features/code/hooks/use-coding-agent.ts` — store `pendingMessage` (líneas ~86-96, ~386, ~487-489, ~789, ~1103-1115, ~1145).
- `packages/chatbot/lib/features/code/types.ts` — `PendingQueues`, `SessionSnapshot.pending`.
- Prior art: `packages/chatbot/tests/unit/agent-code/pending-queues.test.ts`, `packages/chatbot/tests/component/agent-code/use-coding-agent.rehydration.test.tsx`, `packages/chatbot/tests/unit/agent-code/use-coding-agent.test.ts`.

## Comments
