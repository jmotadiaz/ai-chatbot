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
   plus a lifecycle hook that calls `resumeStream()` in two gated moments — on mount only
   when the navigation type is `reload` or `back_forward` (a genuine page reload;
   `performance.getEntriesByType("navigation")`), and on `visibilitychange`/`pageshow` when
   the turn was in flight and the request died — one resume per event, no retry timers.

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
- A normal chat open (`navigate` navigation) no longer probes the registry, so it neither
  replays the previous turn's whole message within the TTL nor races a user send against a
  mount-probe `204` (which could hide the loading state mid-stream or attach the probe to a
  brand-new turn).
- A process restart mid-turn loses the turn: with no persistence there is nothing to
  recover or detect. Accepted cold.
- Returning after the TTL requires a page reload; the RSC/DB remains the source of truth.
- No new infrastructure dependency: the chatbot gains no Redis, no extra service, only a
  module-level `Map`.
- Memory is bounded by the TTL (~60 min) and the number of in-flight turns.
- **Turn-start persistence for existing chats**: while the resume keeps the
  stream alive across a reopen, the reopened UI rendered the OLD assistant
  message from the DB (persistence lives in `onFinish`) plus the replayed new
  turn until the turn persisted — on a regenerate, the replaced answer stayed
  visible alongside its replacement. Existing chats now delete the message the
  turn replaces (`messageId`) and persist the turn's user message (an upsert,
  so `onFinish`'s later write updates it in place) in a single transaction at
  the START of the turn, before the stream is created. New chats keep today's
  behavior (nothing is written early; they cannot reattach mid-turn) and any
  failure degrades silently to that same behavior. The tradeoff: if the end
  transaction fails after this one committed, the replaced message is already
  gone — accepted, rare, and the mirror image of the old ordering's own risk.
