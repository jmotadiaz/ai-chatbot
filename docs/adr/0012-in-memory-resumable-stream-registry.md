---
status: accepted
---

# In-memory resumable stream registry for chat turns (no Redis)

Supersedes the earlier Redis/`resumable-stream` design sketched in the deleted note
`.scratch/chat-resume/sdk-v7-resumable-streams.md`. That note was prose, not a formal ADR,
so there is no ADR to mark as superseded.

## Context

A chat turn's execution is tied to the lifecycle of its HTTP request: the assistant
generation runs inside the `POST /api/chat` response stream, and **all persistence lives in
the stream's `onFinish`** (`packages/chatbot/lib/features/chat/conversation/factory.ts` —
messages, title, memory, compaction). When the client's fetch dies — screen off, browser
backgrounded mid-answer — the turn dies with it: the assistant `Message` is never persisted,
and the returning user sees a frozen partial plus a "Failed to fetch" toast. No resume
mechanism exists for `/api/chat` today (the only one in the repo is the Coding Agent's,
`use-coding-agent.ts`, which does not apply).

**Operator constraint: no Redis.** The chatbot runs as a single pm2 process, so a
process-wide in-memory structure is an acceptable place to keep anything the resume needs.

## Decision

Replay the chat turn's SSE stream from an **in-memory registry** fed by a tee of the
existing response:

1. **Registry (`packages/chatbot/lib/features/chat/resume/registry.ts`)**: a module-level
   `Map` keyed by a per-turn `streamKey` (client-generated uuid sent in the POST body),
   plus a "latest stream per `chatId`" index so a remount that only knows the chat id can
   find the stream. Each entry holds the buffer of already-encoded SSE chunks and a state
   (`streaming` → `persisted`, flipped by `markPersisted`); entries evict by TTL
   (`STREAM_TTL_MS`, ~60 min). API: `register` / `append` / `markPersisted` / `attach`.
2. **Feeding (`packages/chatbot/app/(chat)/api/chat/route.ts`)**: `createUIMessageStreamResponse`
   is created with `consumeSseStream`, which tees every SSE chunk into the registry. With
   this, generation and `onFinish` persistence complete even when the client disconnects:
   a screen going off means "disconnect", not "cancel".
3. **Replay endpoint (`packages/chatbot/app/(chat)/api/chat/[key]/stream/route.ts`)**:
   `GET /api/chat/[key]/stream` answers `text/event-stream` with the full buffer replayed
   from the initial `start` chunk plus the live tail, or `204` when there is nothing to
   resume. This is the URL `DefaultChatTransport.reconnectToStream` already expects.
4. **Client (`packages/chatbot/lib/features/chat/conversation/hooks/use-chat-session.ts`)**:
   `useChat({ id })` with `prepareReconnectToStreamRequest` to resolve the stream key,
   plus a lifecycle hook that calls `resumeStream()` in two moments — on mount, once per
   mount of a persisted chat whatever the navigation type (ticket 08; the probe carries
   the client's last message id as `?after=`), and on `visibilitychange`/`pageshow` when
   the turn was in flight and the request died — one resume per event, no retry timers.
   Send and regenerate await the hook's `resumeGate()` before starting a request.

**Replay always starts at the beginning.** The installed SDK (`ai@6.0.287` /
`@ai-sdk/react@3.0.290`) has no offset protocol: no `Last-Event-ID`, no SSE ids. A
mid-stream replay would duplicate the assistant message or throw `UIMessageStreamError`,
while the `start` chunk carrying the original `messageId` makes a full replay idempotent —
the client discards its partial message and rebuilds it, so reattaching N times yields a
single `Message`.

## Considered Options

- **Redis-backed resumable streams (`resumable-stream`, the design of the previous spec
  revision)**: discarded by the operator constraint (no Redis) and unnecessary for the
  single pm2 process the package exists to serve the multi-process case.
- **Adopting the DB after the TTL** (server action that reconstructs the turn from what
  persisted): discarded; the RSC/DB is already the source of truth — the cure for a missed
  resume is a page reload, not a second persistence path.
- **Partial replay with offsets**: impossible with the SDK contract (`reconnectToStream`
  is GET → full stream or `204`, and the client resume path requires the initial `start`
  chunk to replace the partial message idempotently).

## Consequences

- **Single-process is a structural constraint of the registry**: the registry assumes pm2
  serves the chatbot as one process without cluster. Scaling out would require revisiting
  this ADR. The `Map`s are anchored on `globalThis` under a `Symbol.for` key rather than
  being plain module-level bindings: `next dev` compiles route handlers on demand and
  re-evaluates the shared server modules, which swapped the registry instance and lost
  every in-flight turn on the first resume after a reload (observed as the in-flight turn
  vanishing until it persisted). The anchor keeps the state across module re-evaluations,
  still per process, and the symbol keeps the global namespace clean. Production behaviour
  is unchanged (one module graph, one instance).
- **The mount probe fires on ANY navigation, and the races it once guarded are
  covered separately (ticket 08)**: the probe fires once per mount of a persisted
  chat, whatever the navigation type — a client-side `navigate` (sidebar click,
  app-root reopen) re-attaches to an in-flight turn without a manual reload. The
  races the earlier `reload`/`back_forward` gate guarded against are now covered by:
  `?after=<client's last message id>` on the mount probe — the GET route answers a
  silent `204` when the resolved entry started with that exact message, so the
  common open of an already-answered chat neither replays nor races anything; and a
  `resumeGate()` that serialises sends (send and regenerate await it before
  `beginTurn()` and the request) behind an in-flight resume — the gate is the resume
  promise itself, which always settles (`204`, replay completion or fetch error), and
  when the probe attached to a live stream it resolves when that turn ends, consistent
  with never sending over a live turn. Visibility/pageshow resumes omit `after` (the
  client's last message may be a partial; the full replay is idempotent by the `start`
  chunk).
- A process restart mid-turn loses the turn: with no persistence there is nothing to
  recover or detect. Accepted cold.
- Returning after the TTL requires a page reload; the RSC/DB remains the source of truth.
- No new infrastructure dependency: the chatbot gains no Redis, no extra service, only a
  module-level `Map`.
- Memory is bounded by the TTL (~60 min) and the number of in-flight turns.
- **Turn-start persistence for existing chats (config included, ticket 08)**: while
  the resume keeps the stream alive across a reopen, the reopened UI rendered the OLD
  assistant message from the DB (persistence lives in `onFinish`) plus the replayed
  new turn until the turn persisted — on a regenerate, the replaced answer stayed
  visible alongside its replacement — and the reopened model picker read the chat's
  STALE config even though the in-flight turn was generating with the newly selected
  model. Existing chats now, in a single transaction at the START of the turn,
  persist the turn's config via `updateChat` (`defaultModel`, `defaultTemperature`,
  `chatMode`, `webSearchNumResults`, `ragMaxResources`, `minRagResourcesScore`),
  delete the message the turn replaces (`messageId`) and persist the turn's user
  message (an upsert, so `onFinish`'s later write updates it in place). `updateChat`
  returning `undefined` (no matching row) doubles as the new-chat check: nothing is
  written early and no FK violation can occur — it replaces the old `getChatById`
  existence check. `onFinish` keeps its own `updateChat` with the same values
  (idempotent; covers the degraded path). Any failure degrades silently to that same
  behavior. The tradeoff: if the end transaction fails after this one committed, the
  replaced message is already gone — accepted, rare, and the mirror image of the old
  ordering's own risk.
