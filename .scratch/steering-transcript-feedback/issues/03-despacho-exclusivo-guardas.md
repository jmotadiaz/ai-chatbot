# 03: Despacho exclusivo y guardas del composer

**What to build:** en `AgentCodeChat`, la regla de despacho pasa a ser exclusiva por cola: lo pendiente en `followUp` se muestra como chip (con sus 3 acciones, igual que hoy) y lo pendiente en `steering` se muestra SOLO como burbuja en la conversación (prop `steeringPending` del ticket 02 con la primera entrada no vacía de `pendingQueues.steering`). Con Steering armado NO hay chip sobre el textarea; `hasPending` (cualquier cola no vacía) sigue bloqueando el composer completo, y la burbuja es la señal visual del bloqueo. Sin cambios en guardas, POSTs ni worker; sin estado intermedio entre el click en promover y el `queue_update`. La rehidratación de la burbuja tras recargar viene gratis del ticket 01 (`snapshot.pending`) + este wiring.

**Blocked by:** 01 (El store guarda las PendingQueues crudas), 02 (Burbuja de Steering en la conversación).

**Status:** ready-for-agent

- [ ] Con steering armado: burbuja visible en la conversación, sin chip sobre el textarea, composer bloqueado (solo cancelar vivo)
- [ ] Con follow-up armado: chip con editar/descartar/promover como hoy, sin burbuja
- [ ] Al entregar el mensaje (trío START/CONTENT/END + `queue_update` vacío), el mensaje real aparece y la burbuja desaparece en el mismo tick, sin estado "entregado"
- [ ] Recargar con steering pendiente rehidrata la burbuja desde `snapshot.pending`
- [ ] Tests actualizados: el test "steering-aware chip" de `agent-code-chat-chip-actions.test.tsx` pasa a esperar burbuja-sin-chip; tests de rehidratación cubren la burbuja; suites rápidas del paquete en verde

**Context pointers:**

- Spec: `.scratch/steering-transcript-feedback/spec.md` (User Stories 1-5, "Representación por fase", "Entrega sin lógica de transición", "Composer", "Sin chip intermedio").
- `packages/chatbot/components/code/agent-code-chat.tsx` — `hasPending` (~línea 93-99), chip (~310-356), `AgentConversation` (~297).
- `packages/chatbot/lib/features/code/hooks/use-coding-agent.ts` — `pendingQueues` expuesto por el ticket 01.
- Worker entrega (solo lectura, no se toca): `packages/coding-agent/src/session/turn-runner.ts:424-442`.
- Prior art: `packages/chatbot/tests/component/agent-code/agent-code-chat-chip-actions.test.tsx`, `agent-code-chat-guards.test.tsx`, `agent-code-chat-rehydration.test.tsx`, `use-coding-agent.rehydration.test.tsx`.

## Comments
