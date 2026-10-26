# 03: GET `/api/chat/[key]/stream` — replay + cola viva + 204

**What to build:** Ver `../spec.md` (decisión 4). La route de resume que
`DefaultChatTransport.reconnectToStream` ya espera por defecto.

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] `app/(chat)/api/chat/[key]/stream/route.ts` con el wrapper `withAuth`
  existente: resuelve `key` como `streamKey` directo o como `chatId` vía el
  índice "última stream". Sin entrada viva → `204` (la única señal "nada" que
  el cliente entiende en silencio).
- [ ] Con entrada viva → `Response` SSE (`UI_MESSAGE_STREAM_HEADERS` del SDK:
  `text/event-stream`, `x-vercel-ai-ui-message-stream: v1`,
  `x-accel-buffering: no`) que replay-ea el buffer completo desde el primer
  chunk y luego engancha la cola viva hasta terminal + `[DONE]`. Cada evento
  termina en línea en blanco (el parser SSE del cliente descarta eventos sin
  terminar).
- [ ] El replay incluye chunks de tool y `data-chat`/`data-usage`: en este app
  no hay `onToolCall` en cliente, re-emitirlos tras terminal es inofensivo
  (verificado en la spec).
- [ ] Tests (TDD, contract): replay completo reproduce byte a byte el orden del
  buffer; `204` cuando no hay entrada y cuando el TTL ya evictó; resume de un
  stream aún activo entrega cola viva; auth requerido (401 sin sesión).
  Seguir el prior art de contrato de `app/(chat)/api/agent/code/connect`.
- [ ] Verificación: `pnpm --filter chatbot type:check`, lint,
  `pnpm test:contract`, `pnpm --filter chatbot build:verify`. Nunca `build`.

## Comments
