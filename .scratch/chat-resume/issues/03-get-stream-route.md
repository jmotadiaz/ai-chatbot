# 03: GET `/api/chat/[key]/stream` — replay + cola viva + 204

**What to build:** Ver `../spec.md` (decisión 4). La route de resume que
`DefaultChatTransport.reconnectToStream` ya espera por defecto.

**Blocked by:** 01.

**Status:** resolved

- [x] `app/(chat)/api/chat/[key]/stream/route.ts` con el wrapper `withAuth`
  existente: resuelve `key` como `streamKey` directo o como `chatId` vía el
  índice "última stream". Sin entrada viva → `204` (la única señal "nada" que
  el cliente entiende en silencio).
- [x] Con entrada viva → `Response` SSE (`UI_MESSAGE_STREAM_HEADERS` del SDK:
  `text/event-stream`, `x-vercel-ai-ui-message-stream: v1`,
  `x-accel-buffering: no`) que replay-ea el buffer completo desde el primer
  chunk y luego engancha la cola viva hasta terminal + `[DONE]`. Cada evento
  termina en línea en blanco (el parser SSE del cliente descarta eventos sin
  terminar).
- [x] El replay incluye chunks de tool y `data-chat`/`data-usage`: en este app
  no hay `onToolCall` en cliente, re-emitirlos tras terminal es inofensivo
  (verificado en la spec).
- [x] Tests (TDD, contract): replay completo reproduce byte a byte el orden del
  buffer; `204` cuando no hay entrada y cuando el TTL ya evictó; resume de un
  stream aún activo entrega cola viva; auth requerido (401 sin sesión).
  Seguir el prior art de contrato de `app/(chat)/api/agent/code/connect`.
- [x] Verificación: `pnpm --filter chatbot type:check`, lint,
  `pnpm test:contract`, `pnpm --filter chatbot build:verify`. Nunca `build`.

## Comments

- **204 contract is unchanged for expired entries** (the route treats an
  evicted stream exactly like a never-registered one), and a
  **completed-but-not-expired stream still replays**: the buffer stays
  readable until TTL, the replay ends with the tee's own `data: [DONE]\n\n`,
  and re-emitting tool/`data-chat`/`data-usage` chunks after the terminal is
  safe because no client-side `onToolCall` handlers exist (verified in the
  spec).
- `attach` returns `StreamSnapshot | null`, so the route also answers 204 if
  the entry is evicted in the microsecond between `resolveStreamKey` and
  `attach` (TypeScript forced the branch; it is the correct behaviour anyway).
- The `[DONE]` terminator is never synthesized by the GET route: the
  registry's tee copy already ends with `data: [DONE]\n\n` (SDK's
  `JsonToSseTransformStream` flush), so the replay is byte-for-byte and a live
  tail simply forwards appends until `onEnd` closes the stream.
- No explicit subscriber detach was added: the `cancelled` flag plus the
  registry dropping subscribers on `completeStream`/eviction cover it
  (contract-tested: cancelling the response then appending/completing does not
  throw).
- Auth is tested through the real `withAuth` wrapper by mocking
  `@/lib/features/auth/cached-auth` (`getSession` → null → 401); all other
  tests exercise the same wrapper with a signed-in session.
- `export const maxDuration = 240` added to match the neighbouring streaming
  routes (`/api/chat`, agent-code connect); a no-op on self-hosted pm2.
