---
status: accepted
---

# Message Edit rewinds the Coding Agent Session in place

## Context

A Coding Agent Session is a Pi session: an append-only tree of entries in a JSONL file, where
each entry has an `id` and a `parentId` and a *leaf* pointer marks the active position. The
installed SDK (`@earendil-works/pi-coding-agent@0.85.1`) exposes the whole tree —
`SessionManager.branch()` / `resetLeaf()` / `branchWithSummary()`, `AgentSession.navigateTree()`,
`getUserMessagesForForking()`, `createBranchedSession()` / `AgentSessionRuntime.fork()` — and the
worker used none of it: the only `sessionManager` call in `packages/coding-agent/src` was
`getSessionId()`.

The transcript lives only in that JSONL. Postgres `coding_agent_sessions` is an index of
`sessionId` / `project` / `label` / `modelId` and holds no messages, so the worker is the only
possible author of a history rewrite; a client-side truncation would be overwritten by the next
`MESSAGES_SNAPSHOT`, which the worker builds from `runtime.session.messages`.

Users asked to edit any of their user Messages in a Coding Agent Session and continue from there,
the way they already expect from a normal Chat.

## Decision

**Message Edit rewinds the session in place.** Picking up a previous user Message loads its text
into the composer; on submit the worker calls
`navigateTree(entryId, { summarize: false })`, which moves the leaf to that Message's parent and
rebuilds `agent.state.messages`, and the prompt runs as a normal Turn. The session keeps its
`sessionId`, its JSONL file, its URL and its `coding_agent_sessions` row.

**The abandoned path is forgotten, not summarised and not navigable.** After the rewind the
Messages of the Abandoned Branch stay in the JSONL — nothing is deleted — but no surface ever
reads them again: no branch picker, no tree view, no `branchWithSummary` context entry. Adding a
summary entry would mean an extra inference per edit and a paragraph the user did not ask for.

**One run, not two.** The branch travels as a field on `sendPrompt` rather than as a separate
`branchSession` RPC, so a rewind is always followed by its prompt inside the same run: one
`RUN_STARTED`, one `MESSAGES_SNAPSHOT` that is already the shortened history, one terminal. The
worker treats `navigateTree` returning `cancelled` (a `session_before_tree` hook veto) as a run
error, and refuses to branch while the session is streaming.

**Addressing goes client id → entry id.** The client sends the AG-UI message id it already
renders; the worker resolves it to a Pi entry id by matching `message.clientMessageId` (stamped on
`message_end` and round-tripped through the JSONL) and falling back to `u-<timestamp>`, searching
only the active path (`buildContextEntries()`) so a rewind can never target an already-abandoned
branch. No new field is added to the snapshot payload.

**The working tree is not reverted.** A rewind rewrites the conversation only: files written by
the abandoned Turns stay on disk and the next Turn starts from that state. The editing banner says
so. Reverting to a per-Turn git baseline was rejected — the baseline is a diff captured at Turn
start, so restoring it would discard any manual edit the user made afterwards on the same files.

## Considered Options

- **`fork` / `createBranchedSession` (a new session file per edit)**: keeps the original branch
  intact and navigable, but changes `sessionId`, URL and DB row in the middle of a submit, and
  multiplies entries in Session History for what the user experiences as fixing a typo.
- **A separate `branchSession` RPC before `sendPrompt`**: matches the existing
  `initializeSession` + `sendPrompt` shape and lets the BFF return the short snapshot at once, but
  opens a window where the session is branched and no run exists — an extra state the client would
  have to reconcile, against the single-terminal discipline documented in `turn-runner.ts`.
- **Branching by positional index over the visible Messages**: no id plumbing, but the index over
  the compaction-aware context does not match what the client sees as soon as a Compaction
  intervenes.
- **Optimistic vs snapshot-driven truncation on the client**: done optimistically, so the
  abandoned tail disappears in the same frame as the submit, with the run's `MESSAGES_SNAPSHOT`
  as the authority afterwards. Dimming the tail with a counter while editing is what makes the
  loss visible before it happens.

## Consequences

- **Editing is destructive from the UI and irreversible**: the data is still on disk but no
  affordance reads it back. This is the trade-off accepted for not building a branch navigator.
- **The worker re-stamps `snapshotCursorSeq` on the rewind**, so a reconnect with the cursor of the
  run that performed it replays only the new branch; a reconnect carrying a cursor from *before*
  the rewind hits the existing epoch/`Cursor reset` → `409` → `loadSnapshot()` path.
- **Editing is only possible on an idle session** (the composer is already locked while a Turn
  runs, and `navigateTree` throws while streaming), on a Message still in the active context, and
  never in a read-only view (Subagents). The first user Message of a session is editable through
  `resetLeaf()`; the session's `label` does not change.
- **`TurnFilesChanged` entries of the abandoned Turns are dropped from localStorage**, otherwise
  they stay as phantom Turns keyed by assistant message ids that no longer render.
- **Shared components gain an optional hook, not a new behaviour**: `UserMessage` takes an
  optional `onEdit` and `CopyBlock` an actions slot, both used only by the Coding Agent UI; the
  normal Chat keeps rendering exactly what it rendered before.
