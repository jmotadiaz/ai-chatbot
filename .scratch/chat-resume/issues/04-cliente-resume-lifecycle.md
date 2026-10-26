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

### Review fix: the resume intent (the frozen-page fetch-kill race)

Real-browser hole found in review: on mobile, the page is frozen while
hidden, the OS/browser kills the in-flight fetch, and the JS rejection
(`TypeError: Failed to fetch`) is delivered only AFTER the page resumes —
often AFTER the `visibilitychange` listener has already run. At that instant
`getStatus()` still returned `"streaming"`, so `tryResume()` bailed and
nothing ever resumed the turn until the user backgrounded/foregrounded
again.

Fix: a comeback event (`visibilitychange → visible`, or a bfcache
`pageshow` with `persisted: true`) that lands while a request is still
in-flight no longer just bails — it records a **resume intent** (a ref,
`pendingIntentRef`): never aborting the live request. A new effect in the
hook watches the chat `status` VALUE (the hook now receives `status` as a
prop alongside `getStatus`) and consumes the intent when the status settles
out of `streaming`/`submitted` while the turn is still pending, the page is
visible and no resume is in flight — resuming exactly once. The intent is
cleared by: consuming it, a clean stream end (`noteStreamFinished`), or the
page becoming hidden (no resume while hidden; the next visibility event
records a fresh one). There are still no timers and no retry loops: a
failed resume cannot re-trigger itself from its own status transition
because the intent is consumed before the resume fires, and a status change
with no preceding visibility/pageshow event keeps today's behavior (error +
toast, no automatic resume).

Wiring note: `useChatResume` is now called AFTER `useChatSession` in
`use-chat.ts` (it needs the live `status` value), and the stable callbacks
the session needs (`getStreamKey`, `noteStreamFinished`) reach it through a
holder ref (`resumeApiRef`) populated right after the hook returns — both
are only invoked once a stream is live, never at mount.

Four component tests were added (same jsdom + MSW harness): the frozen-page
race itself (visible event WHILE streaming → then kill → exactly one resume
GET + completed message; this one was RED before the fix), no-intent
no-auto-resume (kill while visible without a visibility event → error
stays), hidden drops the intent (visible → hidden → kill → no resume; next
visible → exactly one), and one intent from two rapid visible events. All
previously documented semantics that remain: one resume per event, no
timers, turn-pending ref, `pageshow persisted: false` ignored, 204 silent,
per-turn `streamKey` URL.

### Verification

`pnpm --filter chatbot type:check`, `lint`, `test:component` (40 files / 222
tests green) and `build:verify` all pass. `pnpm build` was never run.

### Refinement (E2E regression): the mount probe is now gated to reload/back_forward

Running the E2E suite on the branch exposed an intermittent failure
(`tests/e2e/seed.spec.ts`, ~1/3 of runs, "user sends a message and assistant
responds correctly"): the SDK's `resume: true` fires an UNCONDITIONAL mount
probe `GET /api/chat/<chatId>/stream` on every chat page load, even when
nothing is in flight. Two races followed:

1. The probe's `204` could resolve AFTER the user's send started; the SDK's
   resume-stream handler calls `setStatus({ status: "ready" })` on
   `reconnect == null`, hiding the loading state mid-stream.
2. The probe GET could be handled by the dev server AFTER the POST registered
   the turn, so `resolveStreamKey(chatId)` attached it to the BRAND-NEW
   stream: a second consumer replayed the same message id concurrently with
   the POST response (double-write / message reset). Cosmetic third cost:
   every chat open within the TTL replayed the previous turn's whole message.

Fix: drop `resume: true` entirely (the option was removed from
`use-chat-session.ts`). `use-chat-resume.ts` now issues ONE mount probe only
when ALL hold: resume enabled, no turn pending yet, and the navigation type
is `reload` or `back_forward`
(`performance.getEntriesByType("navigation")[0]?.type`; absent/other types
= no probe), guarded by `resumingRef`. `pendingTurnRef` is set before the
probe so a failed probe (`error`) is retried by a later visibility event; if
the probe settles to `ready` (the silent `204` path) the flag is cleared
again. `useChat({ id })` stays, as do the per-turn `streamKey`, the
visibility/pageshow logic with the deferred resume intent, and all server
code. No sessionStorage/localStorage.

Component tests updated (`use-chat-resume.lifecycle.test.tsx`, 14 green): the
harness stubs `performance.getEntriesByType` to control the navigation type;
new tests cover no-probe on `navigate`, one GET + completion on a `reload`
mount (also a `back_forward` mount), and the `204` reload mount settling to
`ready` with the pending flag cleared (a later visibility event is a no-op).
The old "resume: true on mount" test was replaced.
