# 02: Burbuja de Steering en la conversación

**What to build:** en `AgentConversation`, renderizar un nuevo prop `steeringPending?: string | null` como burbuja al final de los items del Turn activo (después del último item, antes del indicador de running), estilo Message del user, puramente informativa y read-only, con un badge estático "Pendiente de entrega" (span atenuado con borde discontinuo). Sin acciones, sin edit/discard/undo, sin ciclo de estados ni temporizadores. El componente no conoce el hook: recibe el texto derivado.

**Blocked by:** 01 (El store guarda las PendingQueues crudas).

**Status:** resolved

- [x] Con `steeringPending` armado, la burbuja aparece al final de los items del Turn activo
- [x] La burbuja muestra el badge estático "Pendiente de entrega" con estilo atenuado/borde discontinuo, distinguible de un mensaje real
- [x] La burbuja es read-only: sin botones, sin acciones
- [x] Con `steeringPending` null/undefined no se renderiza nada nuevo (sin regresión en `AgentConversation` ni en los skeletons)
- [x] Test de componente nuevo para el render de la burbuja (y suites rápidas del paquete en verde)

**Context pointers:**

- Spec: `.scratch/steering-transcript-feedback/spec.md` (Solution, "La burbuja es un derivado", "El badge es estático").
- `packages/chatbot/components/code/agent-conversation.tsx` — props y layout de items; el bubble va tras el último item y antes de `runningIndicator`.
- `packages/chatbot/components/code/agent-message.tsx` — render del user message (`data-role="user"`, `UserMessage`): la burbuja imita el estilo, pero es un bloque propio, NO un `Message` fake ni un `AgentMessage`.
- `packages/chatbot/components/code/coding-agent-skeletons.tsx` — llama a `AgentConversation` con props mínimas; el prop nuevo debe ser opcional.
- Prior art: `packages/chatbot/tests/component/agent-code/subagent-session-view.test.tsx` (render directo de `AgentConversation`).

## Comments

- `feat(chatbot): render an armed steering as a pending bubble in the conversation` en `feat/steering-02-burbuja`. `AgentConversation` acepta `steeringPending?: string | null` y pinta una burbuja read-only (div + span, imitando la forma del `UserMessage`) entre el último item y el `runningIndicator`, con badge estático "Pendiente de entrega". Sin wiring en `agent-code-chat.tsx` (ticket 03).
