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
   `useChat({ id, resume: true })` with `prepareReconnectToStreamRequest` to resolve the
   stream key, plus a `visibilitychange`/`pageshow` lifecycle hook that calls
   `resumeStream()` when the turn was in flight and the request died — one resume per
   event, no retry timers.

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
  this ADR.
- A process restart mid-turn loses the turn: with no persistence there is nothing to
  recover or detect. Accepted cold.
- Returning after the TTL requires a page reload; the RSC/DB remains the source of truth.
- No new infrastructure dependency: the chatbot gains no Redis, no extra service, only a
  module-level `Map`.
- Memory is bounded by the TTL (~60 min) and the number of in-flight turns.
