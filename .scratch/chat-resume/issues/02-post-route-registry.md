# 02: POST `/api/chat` alimenta el registry (tee vía `consumeSseStream`)

**What to build:** Ver `../spec.md` (decisiones 2 y 3). El POST existente
publica su stream en el registry y confirma la persistencia al terminar.

**Blocked by:** 01.

**Status:** resolved

- [x] `app/(chat)/api/chat/route.ts`: `createUIMessageStreamResponse({ stream,
  consumeSseStream })` — el tee codifica a SSE (`JsonToSseTransformStream`) y
  hace `append` en el registry. El `streamKey` llega en el body del POST
  (uuid generado por el cliente); chats nuevos sin `chatId` registran solo con
  la key, y `onFinish` actualiza el índice con el `dbChatId` resultante.
- [x] `lib/features/chat/conversation/factory.ts`: al completar el `onFinish`
  (tras la transacción de persistencia), `markPersisted(key)`. No tocar la
  transacción: mensajes, title, memoria y compactación quedan exactamente como
  están; solo se añade la confirmación.
- [x] Validar `streamKey` en el handler (formato uuid; ausente → comportamiento
  actual degradado sin registro, sin romper turnos legacy).
- [x] Tests (TDD, contract, frontera HTTP con Mock Gateway): cliente
  desconecta a mitad del stream → la generación completa y `onFinish` persiste
  una sola vez (sin duplicados de Message ni doble title); el registry recibe
  todos los chunks en orden incluido el `start` inicial; `markPersisted` se
  dispara exactamente una vez por turno.
- [x] Verificación: `pnpm --filter chatbot type:check`, lint,
  `pnpm test:contract`, `pnpm --filter chatbot build:verify`. Nunca `build`.

## Comments

**What landed**

- `packages/chatbot/app/(chat)/api/chat/route.ts`: parses the optional
  `streamKey` from the body (manual destructuring style, no zod) and validates
  it with `validate` from `"uuid"` (works server-side in this bundler). A valid
  key on a non-`preventChatPersistence` turn calls `register(streamKey,
  { chatId })` before building the response, forwards `streamKey` down
  `processChatResponse`, and passes `consumeSseStream` to
  `createUIMessageStreamResponse`. Absent/invalid keys and
  `preventChatPersistence` turns keep today's behavior exactly (no
  registration, no tee, zero registry memory — spec decision 6).
- `packages/chatbot/lib/features/chat/resume/consume-sse.ts` (new,
  `server-only`): `createRegistrySseConsumer(streamKey)` builds the SDK's
  fire-and-forget `consumeSseStream` callback — reads every already-encoded
  SSE frame, `append`s it, logs+swallows read errors, and always calls
  `completeStream` in `finally` (the SDK never awaits the callback, so a
  rejection would be an unhandled rejection). No `@ai-sdk/*` imports.
- `packages/chatbot/lib/features/chat/handlers.ts`: optional `streamKey` added
  to the wrapper's inline type and forwarded.
- `packages/chatbot/lib/features/chat/conversation/factory.ts`: optional
  `streamKey` on the returned function's type; inside `onFinish`'s big `try`,
  right after the persistence `transaction(...)` resolves and
  `resolvedChatId` is computed: `setChatId(streamKey, resolvedChatId)` (when
  both defined), then `markPersisted(streamKey)`. Both are no-ops for legacy
  turns, skipped for `preventChatPersistence` turns (early return) and when
  the transaction throws (the catch swallows). Transaction/title/memory/
  compaction/`data-chat`/`data-usage` untouched.

**Where `markPersisted` sits**

Inside `onFinish`'s existing `try`, after `transaction(...)` resolves and
`resolvedChatId` is computed, before the compaction fire-and-forget — so it
only runs when persistence actually committed (not on the swallowed
catch path, not for `preventChatPersistence` turns).

**How legacy turns degrade**

No `streamKey` (or an invalid/non-uuid one) → `resumableStreamKey` is
`undefined` in the route: no `register`, no `consumeSseStream`, `streamKey:
undefined` forwarded; the factory's `markPersisted`/`setChatId` calls are
no-ops. Turn streams and persists exactly as before.

**Test files**

- `packages/chatbot/tests/contract/chat/post-route-registry-feed.test.ts` —
  route boundary with stubbed `processChatResponse`: tees every frame in order
  (start first, `data: [DONE]\n\n` last), registry asserted only through the
  public API; `preventChatPersistence` and invalid-key turns register nothing.
- `packages/chatbot/tests/contract/chat/post-route-resume-persistence.test.ts`
  — full pipeline (real factory + PGlite + paced `MockLanguageModelV3`):
  client disconnects mid-stream (body cancel) → generation completes,
  exactly one user + one assistant DB message, assistant content complete,
  entry `persisted`; legacy (absent/invalid key) turns stream+persist with no
  registry entry. Exactly-once is proven behaviorally (DB counts + state
  flag); `markPersisted` runs inside the SDK's once-per-stream `onFinish`
  guard, so no spy was needed.

All green: `type:check`, `lint`, `test:contract` (33 tests, 9 files),
`test:unit` (354 tests, 48 files), `build:verify`.

## Comments
