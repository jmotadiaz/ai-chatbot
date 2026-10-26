# 04: Cliente — `resume: true`, key en la request y hook de ciclo de vida

**What to build:** Ver `../spec.md` (decisiones 3 y 5). El cliente se re-engancha
al volver, sin tocar nada.

**Blocked by:** 02, 03.

**Status:** resolved

- [x] `use-chat-session.ts`: pasar `id` del chat (persistido) + `resume: true`.
  Para el turno de un chat nuevo (sin `chatId` todavía), el `streamKey` viaja
  en el body del POST y el resume apunta a la route GET vía
  `prepareReconnectToStreamRequest` leyendo la key vigente (ref del hook,
  no cierre del scope). Quitar el no-op de `resumeStream` de
  `provider.tsx` (el valor real ya llega del `useChat`).
- [x] Hook de ciclo de vida (espejo de
  `lib/features/code/hooks/use-coding-agent.ts:886-945`):
  `visibilitychange` + `pageshow` → si la request murió (estado `error`/`ready`
  con turno en vuelo conocido por el propio cliente; sin heurísticas sobre el
  contenido de los mensajes), `resumeStream()`. Un resume por evento de
  visibilidad; sin timers de reintento. Excluye chats con
  `preventChatPersistence` (hub, temporales, project-form): quedan como hoy.
- [x] El toast "Failed to fetch" queda como está (fuera de alcance).
- [x] Tests (TDD, component): pantalla off→on reanuda (`visibilitychange`
  simulado) y el Message se completa sin intervención; remontaje de página con
  stream activo reataca por `resume: true`; `204` no ensucia el estado (status
  `ready`, sin error); varias reconexiones sucesivas producen un único
  Message. Modelar sobre
  `tests/component/agent-code/use-coding-agent.lifecycle.test.tsx`.
- [x] Verificación: `pnpm --filter chatbot type:check`, lint,
  `pnpm test:component`, `pnpm --filter chatbot build:verify`. Nunca `build`.

## Comments

### The hook's state machine (`use-chat-resume.ts`, new file)

Three refs drive everything (no timers, no heuristics over message contents):

- `streamKeyRef` — the CURRENT turn's resume key. Written by `beginTurn()`
  (called by `useChatSubmit` right before `send`, and by `useChatReload`
  before `regenerate`), read by `getStreamKey()` (the transport's
  `prepareReconnectToStreamRequest`), cleared by `noteStreamFinished` on a
  clean end.
- `pendingTurnRef` — "the client knows it had a turn in flight". Set by
  `beginTurn()`, cleared by `noteStreamFinished` ONLY when the stream ended
  cleanly (`!isError && !isDisconnect`, with `isAbort` treated as finished
  too: a user stop is deliberate and persists the partial server-side). On
  error/disconnect the flag stays set so a later visibility event can
  resume.
- `resumingRef` — a resume in flight; further events are ignored until it
  settles (the next event after a failure is the retry — no retry timers).

`tryResume()` (single entry point for both listeners) fires exactly one
`resumeStream()` only when ALL hold: resume enabled, turn pending, not
already resuming, and the chat status is NOT `streaming`/`submitted` (never
abort a live POST with a reconnect). `enabled`, `getStatus` and
`resumeStream` reach the once-registered listeners through refs, so the
effect subscribes exactly once per mount.

The pending-turn signal is the honest client-side truth (open question 8 of
the exploration notes): a hard fetch death surfaces via `onError` + status
`error`, and `onFinish` may not fire at all — the ref set at send time
survives that. A clean end (or a 204 resume) closes the turn.

### Where the key is generated and injected

- Generated per send (never per chat) by `beginTurn()` in `use-chat-resume.ts`
  (uuid v4, the repo's client util).
- Injected into the POST body in `use-chat-submit.ts`
  (`{ ...body, streamKey }`); the body is left untouched when resume is
  disabled (`beginTurn` is not even wired).
- `use-chat.ts` computes `resumeEnabled = !preventChatPersistence &&
  Boolean(effectiveChatId)`; only then it passes `id: effectiveChatId`,
  `resume: true`, `getStreamKey` and the composed `onFinish`
  (`noteStreamFinished(args)` + the existing query-param logic) to
  `useChatSession`. The hub (`use-chat-hub-instance.ts` calls
  `useChatSession` directly) and the project form keep today's behavior.
- `use-chat-session.ts` builds the transport with
  `prepareReconnectToStreamRequest`: when `getStreamKey()` returns a key the
  resume GET goes to `${api}/${key}/stream` (per-turn registry entry);
  otherwise it returns `{}` so the SDK's default
  `/api/chat/<chatId>/stream` is used (resolved via the registry's
  latest-stream-per-chat index). The widened `onFinish` now receives the
  full SDK callback args (`isAbort`/`isDisconnect`/`isError`). The `onError`
  toast is untouched.
- Regenerate: yes, it got the key — `use-chat-reload.ts` takes the same
  optional `beginTurn` and spreads `streamKey` into the `regenerate` body
  (a one-line-scale change, so it was wired).

### `provider.tsx` outcome

**Not changed.** The `resumeStream: async () => {}` in the default
`createContext<UseChatResult>` value is REQUIRED by the type (a complete
`UseChatResult` literal) and only ever surfaces when a consumer renders
outside a `<ChatProvider>` — `ChatProvider` always replaces the whole
context value with the real `useChat()` result, which includes the SDK's
`resumeStream`. Removing it would break `createContext<UseChatResult>` for
no behavioral gain, so the no-op stays.

### Tests

`tests/component/chat/use-chat-resume.lifecycle.test.tsx` (7 tests, jsdom +
MSW, real `useChat` stack): (1) screen off mid-stream → one
`visibilitychange` → exactly one GET to `/api/chat/<streamKey>/stream` →
message completed, single assistant message, status `ready`; (2) bfcache
`pageshow` (`persisted: true`) resumes, the initial-load `pageshow`
(`persisted: false`) does not; (3) 204 is silent (status `ready`, error
cleared, messages untouched, no retry); (4) two kill→reconnect rounds still
yield ONE assistant message (full replay from the original `start` frame is
idempotent); (5) mount with `resume: true` issues exactly one GET to the
chatId URL and completes the message (remount/paste-URL); (6)
`preventChatPersistence` chats send no `streamKey` and never contact the
stream route; (7) no resume while the POST is still alive (visibility
during `streaming` is ignored, the in-flight stream completes undisturbed).

Harness notes: the resume GET handlers are stateful (204 for the
mount-time GET before the turn's POST exists, replay afterwards), and the
killable POST/resume streams die with `TypeError("Failed to fetch")` — a
network death, not an SDK abort — which is what `isDisconnect`/pending-turn
semantics expect. `NuqsTestingAdapter` wraps the harness (`useChat` needs a
nuqs adapter in jsdom); `sonner` is mocked.

### Verification

`pnpm --filter chatbot type:check`, `lint`, `test:component` (40 files / 218
tests green), `test:unit` (48 files / 359 tests green) and `build:verify`
all pass. `pnpm build` was never run.
