# 01: El store guarda las PendingQueues crudas

**What to build:** en el hook `use-coding-agent`, el estado `pendingMessage: string | null` pasa a guardar las `PendingQueues` crudas del worker (`{ steering, followUp }`); el hook expone `pendingQueues` y mantiene `pendingMessage` como derivado (vía `pendingChipText`) para no romper el chip existente. El evento `queue_update` y la rehidratación (`snapshot.pending`, seed SSR y `loadSnapshot`) alimentan las colas crudas; `cancel()` sigue drenando y devolviendo el texto vía el derivado. Sin cambios visibles todavía: el chip se comporta igual.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] El store guarda `PendingQueues` crudas (una sola fuente: evento `queue_update` y `snapshot.pending` la alimentan igual)
- [x] El hook expone `pendingQueues` y `pendingMessage` sigue derivando vía `pendingChipText` (chip intacto, tests existentes en verde)
- [x] `cancel()` drena y devuelve el texto como draft igual que hoy
- [x] Suites rápidas en verde: `pnpm type:check`, lint del paquete, tests unit/component de agent-code afectados

**Context pointers:**

- Spec: `.scratch/steering-transcript-feedback/spec.md` (decisión "Store").
- `packages/chatbot/lib/features/code/pending-queues.ts` — `pendingChipText`, `pendingQueuesOf`, `pendingMessageFromEvent` (el último pasa a devolver `PendingQueues | undefined`).
- `packages/chatbot/lib/features/code/hooks/use-coding-agent.ts` — store `pendingMessage` (líneas ~86-96, ~386, ~487-489, ~789, ~1103-1115, ~1145).
- `packages/chatbot/lib/features/code/types.ts` — `PendingQueues`, `SessionSnapshot.pending`.
- Prior art: `packages/chatbot/tests/unit/agent-code/pending-queues.test.ts`, `packages/chatbot/tests/component/agent-code/use-coding-agent.rehydration.test.tsx`, `packages/chatbot/tests/unit/agent-code/use-coding-agent.test.ts`.

## Comments

- Implementado en el commit `feat(chatbot): store the raw pending queues for the steering flow` de la rama `feat/steering-01-store-colas` (el propio cierre del ticket forma parte de ese commit, así que su SHA es el de `HEAD`: `git log -1`). El store pasa a guardar `pendingQueues: PendingQueues` (seed SSR, `loadSnapshot` y `queue_update` la alimentan con `pendingQueuesOf`); `pendingMessage` queda como derivado `pendingChipText(state.pendingQueues)`. `pendingMessageFromEvent` se renombró a `pendingQueuesFromEvent(event): PendingQueues | undefined` (misma semántica de `undefined` para eventos no-queue) y se añadió `emptyPendingQueues()`. `cancel()` vacía las colas crudas y sigue devolviendo `pendingChipText(cleared)`. Sin tocar componentes, worker ni rutas BFF. Verificado: `pnpm type:check`, `pnpm --filter chatbot lint`, `test:unit` (294), `test:component` (194), `test:integration` (48), `test:contract` (17) — todo en verde.
