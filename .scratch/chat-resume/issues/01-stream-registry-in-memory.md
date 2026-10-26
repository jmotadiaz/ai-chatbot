# 01: Registry in-memory de streams reanudables

**What to build:** Ver `../spec.md` (decisión 1). Módulo nuevo en
`packages/chatbot` con el registry process-wide que alimenta y sirve los
streams reanudables del chat.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Módulo nuevo (`lib/features/chat/resume/registry.ts`): `Map`
  claveado por `streamKey` (uuid por turno) + índice "última stream por
  `chatId`". API mínima: `register(key, { chatId? })`, `append(key, sseChunk)`,
  `markPersisted(key)`, `get(key)`, `getLatestByChat(chatId)`, `evict`.
  Sin `globalThis`; module-level singleton como los existentes
  (`lib/infrastructure/ai/catalog.ts` como precedente).
- [x] Buffer: chunks SSE ya codificados (`data: {...}\n\n`), concatenados en
  orden; el chunk `start` con el `messageId` original queda primero (requisito
  de idempotencia del replay).
- [x] Estados: `streaming` → `persisted` (confirmado por el `onFinish` de la
  factoría); el buffer sigue servible tras terminal hasta el TTL.
- [x] Evict por TTL (~60 min tras `persisted`; valor como constante del
  módulo). Sin persistencia en disco: un reinicio del proceso pierde el
  buffer por diseño (spec, "Fuera de alcance").
- [x] Tests (TDD, unit): append en orden y replay desde el primer chunk;
  `markPersisted` no evict; evict por TTL; índice por `chatId` apunta a la
  última stream; concurrencia de varias streams del mismo chat no se pisan
  (clave por `streamKey`, no por `chatId`).
- [x] Verificación: `pnpm --filter chatbot type:check`, lint,
  `pnpm test:unit` y `pnpm --filter chatbot build:verify`. Nunca `build`.

## Comments

- `lib/features/chat/resume/registry.ts`: process-wide in-memory registry of
  resumable chat streams (module-level `Map` keyed by `streamKey` + a
  "latest stream per chatId" index), fed by the POST route's `consumeSseStream`
  tee and read by the GET resume route.
- Public API: `register` (idempotent upsert), `append` (never throws, notifies
  subscribers), `markPersisted`, `completeStream`, `setChatId`, `get`,
  `getLatestByChat`, `attach` (atomic snapshot + subscriber registration),
  `evict`; types `StreamState`/`StreamSnapshot`/`StreamSubscriber`.
- TTL: `STREAM_TTL_MS = 60 min`, clock starts at `register` (a stream that
  never persists cannot leak), refreshed by `markPersisted`; expiry is a lazy
  sweep at the top of every public function — no timers (`vi.setSystemTime`
  drives it in tests).
- `attach` returns the snapshot (the past) and registers the subscriber (the
  future) in one synchronous block; on a completed stream it returns the
  snapshot WITHOUT registering; eviction delivers `onEnd` to live subscribers.
- Tests: `tests/unit/chat/resume/registry.test.ts` (28 tests, public API only,
  fake timers, per-test singleton reset via clock-advance + `evict`).
  Gates: type:check, lint, test:unit (354), build:verify — all green.
