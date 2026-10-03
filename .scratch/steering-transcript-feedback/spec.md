# Spec: Steering visible en el transcript

**Status:** ready-for-agent

**Procedencia:** sesión de grilling 2026-09-30 (design tree cerrado, frontera vacía). Padre conceptual: `steering-mid-turn` (spec.md), cuyo flujo de dos fases no se toca.

## Problem Statement

Al promover un Mensaje en Espera a Steering, el único feedback del usuario es el chip sobre el textarea: discreto, fuera del contexto conversacional y dependiente del run stream (si este cae tras el POST exitoso, el chip nunca aparece y el texto queda invisible hasta la entrega, que puede tardar lo que dure la tool en curso). El texto enviado no se ve en la conversación hasta que el modelo lo consume.

## Solution

Representar el Steering armado como una burbuja al final de los items del Turn activo — estilo Message del user, puramente informativa, con distintivo estático "pendiente de entrega". El chip se queda como está para el Mensaje en Espera (follow-up): solo cambia dónde se muestra lo pendiente según la cola que lo sostiene. La cola del worker (`queue_update`) sigue siendo la única fuente de verdad; no hay reconciliación, ni dedup, ni RPCs nuevos.

## User Stories

1. As a coding session driver, I want my promoted Steering to appear in the transcript as a pending user-message bubble, so that I can see my sent instruction in the conversation while the current tool runs.
2. As a coding session driver, I want the bubble to carry a "pendiente de entrega" badge and muted styling, so that I never mistake it for a message the model already received.
3. As a coding session driver, I want the bubble replaced by the real user message on delivery, so that the transcript reads naturally without a leftover pending item.
4. As a coding session driver, I want the bubble rehydrated on reconnect from the snapshot's pending queues, so that a refresh does not hide an armed Steering.
5. As a coding session driver, I want the Steering bubble to be read-only (no edit/discard/undo), so that "promote to steering" means sent — the only way back is cancelling the Turn, as today.

## Implementation Decisions

- **Representación por fase, derivada de la cola:** lo pendiente en la cola `followUp` se muestra como hoy (chip sobre el textarea con editar/descartar/promover); lo pendiente en la cola `steering` se muestra como burbuja al final de los items del Turn activo. Nunca coexisten (single-pending: promover hace clear-then-enqueue), así que la regla de despacho es exclusiva.
- **La burbuja es un derivado del estado de cola, no un Message fake:** se renderiza desde las colas crudas del worker, no se inserta en la lista de mensajes del store. Sin id sintético, sin reconciliación por contenido, sin rollback.
- **Store:** `pendingMessage` (string derivado vía `pendingChipText`) pasa a guardar las `PendingQueues` crudas; el chip y la burbuja derivan cada uno lo suyo (misma dirección que ya usa la rehidratación desde `snapshot.pending`).
- **Entrega sin lógica de transición:** en la entrega, el mismo evento Pi genera primero el trío START/CONTENT/END del mensaje real y después el `queue_update` que vacía la cola (`turn-runner.ts:424-442`) — el mensaje real aparece y la burbuja cae en el mismo tick. Sin hueco ni duplicado; no hay estado "entregado".
- **El badge es estático:** un span con estilo atenuado/borde discontinuo. Sin ciclo de estados (enviando/entregado) ni temporizadores.
- **Composer:** sin cambios de guardas. `hasPending` sigue bloqueando el composer (single-pending); con Steering armado no hay chip en el área del textarea y la burbuja es la señal visual del bloqueo.
- **Worker y rutas BFF: sin cambios.** No se añade `unsteer` (decisión explícita: promover a Steering es "enviar ya", no un estado reversible; el retroceso es `cancel`, que drena y devuelve el texto como draft).
- **Sin chip intermedio:** entre el click en promover y el `queue_update` que mueve el texto del chip a la burbuja no se añade estado local; el POST es rápido, su fallo ya va al banner con el chip intacto.

## Testing Decisions

- Externamente visible: burbuja aparece al promover, badge visible, burbuja desaparece cuando llega el mensaje real entregado, chip reaparece si se des-promueve… no aplica (no hay des-promoción) — en su lugar: chip reaparece para follow-up, burbuja rehidratada tras reconectar con snapshot pendiente, composer bloqueado con burbuja armada.
- Seams (los más altos disponibles, prioridad a existentes): AG-UI event stream boundary para `queue_update` y trío de entrega; hook store (`use-coding-agent`) para el despacho followUp→chip / steering→burbuja y la rehidratación; componente (`agent-code-chat`) para render de burbuja y guardas del composer.
- Prior art: `tests/component/agent-code/agent-code-chat-chip-actions.test.tsx`, `use-coding-agent.rehydration.test.tsx`, `agent-code-chat-rehydration.test.tsx`, `tests/unit/agent-code/agui-stream-relay.test.ts`. Cada ticket mantiene verdes las suites rápidas (lint, type-check, tests afectados).

## Out of Scope

- Acciones sobre la burbuja de Steering (editar, descartar, deshacer) — rechazadas: promover es "enviar ya".
- RPC `unsteer` worker-side — no existe necesidad sin des-promoción.
- Cambiar el chip del Mensaje en Espera o el flujo de dos fases (`steering-mid-turn`).
- Adjuntos/skills/comentarios en cola (texto plano v1, v2 de `steering-mid-turn`).
- Optimistic UI client-side con reconciliación (burbuja fake + dedup): rechazado en grilling — rompe la invariante de fuente única (cola del worker) para cosmética.
- Badge dinámico de progreso de entrega (enviando/entregado): rechazado por complejidad innecesaria.
