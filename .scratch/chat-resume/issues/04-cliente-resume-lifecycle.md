# 04: Cliente — `resume: true`, key en la request y hook de ciclo de vida

**What to build:** Ver `../spec.md` (decisiones 3 y 5). El cliente se re-engancha
al volver, sin tocar nada.

**Blocked by:** 02, 03.

**Status:** ready-for-agent

- [ ] `use-chat-session.ts`: pasar `id` del chat (persistido) + `resume: true`.
  Para el turno de un chat nuevo (sin `chatId` todavía), el `streamKey` viaja
  en el body del POST y el resume apunta a la route GET vía
  `prepareReconnectToStreamRequest` leyendo la key vigente (ref del hook,
  no cierre del scope). Quitar el no-op de `resumeStream` de
  `provider.tsx` (el valor real ya llega del `useChat`).
- [ ] Hook de ciclo de vida (espejo de
  `lib/features/code/hooks/use-coding-agent.ts:886-945`):
  `visibilitychange` + `pageshow` → si la request murió (estado `error`/`ready`
  con turno en vuelo conocido por el propio cliente; sin heurísticas sobre el
  contenido de los mensajes), `resumeStream()`. Un resume por evento de
  visibilidad; sin timers de reintento. Excluye chats con
  `preventChatPersistence` (hub, temporales, project-form): quedan como hoy.
- [ ] El toast "Failed to fetch" queda como está (fuera de alcance).
- [ ] Tests (TDD, component): pantalla off→on reanuda (`visibilitychange`
  simulado) y el Message se completa sin intervención; remontaje de página con
  stream activo reataca por `resume: true`; `204` no ensucia el estado (status
  `ready`, sin error); varias reconexiones sucesivas producen un único
  Message. Modelar sobre
  `tests/component/agent-code/use-coding-agent.lifecycle.test.tsx`.
- [ ] Verificación: `pnpm --filter chatbot type:check`, lint,
  `pnpm test:component`, `pnpm --filter chatbot build:verify`. Nunca `build`.

## Comments
