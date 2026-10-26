# 02: POST `/api/chat` alimenta el registry (tee vía `consumeSseStream`)

**What to build:** Ver `../spec.md` (decisiones 2 y 3). El POST existente
publica su stream en el registry y confirma la persistencia al terminar.

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] `app/(chat)/api/chat/route.ts`: `createUIMessageStreamResponse({ stream,
  consumeSseStream })` — el tee codifica a SSE (`JsonToSseTransformStream`) y
  hace `append` en el registry. El `streamKey` llega en el body del POST
  (uuid generado por el cliente); chats nuevos sin `chatId` registran solo con
  la key, y `onFinish` actualiza el índice con el `dbChatId` resultante.
- [ ] `lib/features/chat/conversation/factory.ts`: al completar el `onFinish`
  (tras la transacción de persistencia), `markPersisted(key)`. No tocar la
  transacción: mensajes, title, memoria y compactación quedan exactamente como
  están; solo se añade la confirmación.
- [ ] Validar `streamKey` en el handler (formato uuid; ausente → comportamiento
  actual degradado sin registro, sin romper turnos legacy).
- [ ] Tests (TDD, contract, frontera HTTP con Mock Gateway): cliente
  desconecta a mitad del stream → la generación completa y `onFinish` persiste
  una sola vez (sin duplicados de Message ni doble title); el registry recibe
  todos los chunks en orden incluido el `start` inicial; `markPersisted` se
  dispara exactamente una vez por turno.
- [ ] Verificación: `pnpm --filter chatbot type:check`, lint,
  `pnpm test:contract`, `pnpm --filter chatbot build:verify`. Nunca `build`.

## Comments
