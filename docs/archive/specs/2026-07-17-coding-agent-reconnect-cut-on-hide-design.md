# Coding Agent Reconnect: Cut-on-Hide, Robust Reconnect

- **Date:** 2026-07-17
- **Status:** Approved (design), pending implementation plan
- **Scope:** `packages/chatbot/lib/features/code/` — `ConnectableHttpAgent`, `useCodingAgent` hook, and their tests.
- **Motivation:** When a user leaves the coding-agent tab and returns, the UI frequently surfaces a spurious "network error". The current reconnect-on-visible path is one-shot: if the reconnect `fetch` fails transiently it is surfaced to the user instead of being retried. The current design also keeps stale/zombie streams open in the background, leaving the state non-deterministic when the tab regains focus.

## Goals

1. Eliminate spurious "network error" surfaces when returning to the tab by retrying transient connect failures with backoff.
2. Make the connection state deterministic on tab regain by proactively cutting the stream when the tab becomes hidden.
3. Keep the existing cursor/epoch resume protocol — it remains optimal for delta replay.
4. Recover automatically from edge cases that today leave the UI stuck (e.g. a run started with no cursor ever arriving).

## Non-Goals

- Changing the worker (`packages/coding-agent`) — the worker already handles `res.on("close")` with `cancel="client_disconnected"`, logs events to `SessionEventLog` regardless of subscribers, and auto-closes `connectToSession` on terminal/idle. No worker changes.
- Heartbeats / pings / WebSocket — out of scope.
- Reconnecting while the tab stays hidden (deliberately not done — the UI isn't viewed).
- Multi-tab coordination for a single session.

## Current Behavior (Before)

- Stream stays **open in the background** when the tab loses visibility.
- Reconnect is triggered **only on regaining visibility** (`visibilitychange → visible`), `pageshow`, or `online` — and only if `shouldReconnectRef.current === true`, `document.visibilityState === "visible"`, and `Date.now() - lastEventAtRef.current >= RECONNECT_FRESHNESS_MS` (3000ms).
- `ensureConnected` calls `agent.detachActiveRun()` (RxJS-only) then `connect(cursor)` — never aborts the underlying `fetch`.
- `connect()` is one-shot: a transient `fetch` rejection is surfaced as an error in the UI (deliberate, per "surfaces a genuine connection failure..." test), no retry.
- Cursor-reset (409) is handled once by reloading snapshot and reconnecting.
- `ConnectableHttpAgent.abortRun()` exists but is **never called** in normal flow (only if the cleanup path were rewritten). The internal `AbortController` is never reset.
- `ensureConnected` returns early if `cursorRef.current === null` — leaves the UI stuck when a run started but no cursor event ever arrived.

## Design

### Behavior Contract (state machine)

| Tab visibility transition | `shouldReconnectRef` | Action |
|---|---|---|
| `visible` (steady) | run active, stream flowing | (unchanged) |
| `visible → hidden` | `true` | **Cut stream** — call `agent.abortRun()` (swap+abort the `AbortController`). Do not mutate `shouldReconnectRef` (stays `true`) or `cursorRef`. Worker is notified via `res.on("close")`. |
| `visible → hidden` | `false` (idle) | Nothing to cut. |
| `hidden → visible` | `true` | **Reconnect immediately** (no debounce, no staleness gate). Call `ensureConnected(reason="visibility:visible")`. |
| `hidden → visible` | `false` | Nothing to reconnect. |
| `pageshow` (iOS bfcache) | `true` | Reconnect (`ensureConnected(reason="pageshow")`). |
| `online` | `true` and tab visible | Reconnect. |
| `online` | tab hidden | Ignored — will be handled by the next `visibility:visible`. |

### File 1: `ConnectableHttpAgent` (`connectable-http-agent.ts`)

Single change to `abortRun()`. Swap-then-abort so the next `run()`/`connect()` does not inherit an aborted signal:

```ts
abortRun(): void {
  const old = this.abortController;
  this.abortController = new AbortController();
  old.abort();
}
```

Order matters: the fresh controller is installed before the old one is aborted, so any in-flight read of `this.abortController` returns the fresh one.

### File 2: `useCodingAgent` (`use-coding-agent.ts`)

#### New module-local constants

```ts
const MAX_CONNECT_ATTEMPTS = 4; // 1 initial + 3 retries
const CONNECT_BACKOFF_MS = [300, 600, 1200]; // delays before retry attempts 1, 2, 3
```

Semantics: a `connect(cursor, attempt)` call is attempt `attempt` (0 = initial). On a transient failure, retry is scheduled only if `attempt + 1 < MAX_CONNECT_ATTEMPTS`. The i-th retry waits `CONNECT_BACKOFF_MS[attempt]` ms before firing `connect(cursor, attempt + 1)`. Total network calls = 4, with backoffs between them = 300 + 600 + 1200 ms (2.1s combined).

#### Remove

- `RECONNECT_FRESHNESS_MS` constant.
- `lastEventAtRef` ref and its set in `onEvent` (line 242).
- `reconnectIfStale` helper.

#### Add inside the main effect

A pending-retry handle and its cancellation:

```ts
let pendingRetryTimer: ReturnType<typeof setTimeout> | null = null;
const cancelPendingRetry = () => {
  if (pendingRetryTimer) {
    clearTimeout(pendingRetryTimer);
    pendingRetryTimer = null;
  }
};
```

A symmetric abort-error detector (mirrors the swallow already done internally by `@ag-ui/client`'s pipeline):

```ts
const isAbortError = (err: unknown): boolean => {
  if (!(err instanceof Error)) return false;
  const name = err.name.toLowerCase();
  const msg = err.message.toLowerCase();
  return name === "aborterror" || /aborted|fetch is aborted/.test(msg);
};
```

A cut helper:

```ts
const cutStream = (reason: string) => {
  if (!shouldReconnectRef.current) return;
  cancelPendingRetry();
  writeClientTrace({
    runId: crypto.randomUUID(),
    sessionId,
    eventName: "client.stream.cut",
    payload: { reason },
  });
  agent.abortRun();
};
```

A reconnect-now entrypoint (replaces the body of the previous `reconnectIfStale` callers):

```ts
const reconnectNow = (reason: string) => {
  if (cancelled || recovering) return;
  if (!shouldReconnectRef.current) return;
  void ensureConnected(reason);
};
```

#### Rewrite `connect()` (replaces current lines 391–439)

```ts
const connect = async (cursor: SessionCursor, attempt = 0) => {
  if (cancelled || connecting) return;
  connecting = true;
  const runId = crypto.randomUUID();
  writeClientTrace({
    runId,
    sessionId,
    eventName: "client.connect.start",
    payload: { project, modelId, cursor, attempt },
  });
  try {
    await agent.connectAgent({
      runId,
      context: [
        { description: "project", value: project },
        { description: "sessionId", value: sessionId },
        { description: "modelId", value: modelId },
      ],
      forwardedProps: { afterSeq: cursor.seq, epoch: cursor.epoch },
    });
    writeClientTrace({ runId, sessionId, eventName: "client.connect.complete" });
  } catch (err) {
    if (cancelled) return;

    // Cursor reset (worker restarted): one-shot reload + reconnect.
    if (isCursorResetError(err) && !retriedAfterCursorReset) {
      retriedAfterCursorReset = true;
      await loadSnapshot();
      return;
    }

    // Deliberate abort from cut-on-hide: swallow silently, no surface, no retry.
    if (isAbortError(err)) {
      writeClientTrace({
        runId,
        sessionId,
        eventName: "client.connect.aborted",
        payload: { attempt },
      });
      return;
    }

    // Transient failure: retry with exponential backoff.
    if (attempt + 1 < MAX_CONNECT_ATTEMPTS) {
      const delay = CONNECT_BACKOFF_MS[attempt];
      writeClientTrace({
        runId,
        sessionId,
        eventName: "client.connect.retry",
        payload: { attempt, delayMs: delay, next: attempt + 1 },
      });
      cancelPendingRetry();
      pendingRetryTimer = setTimeout(() => {
        pendingRetryTimer = null;
        void connect(cursor, attempt + 1);
      }, delay);
      return;
    }

    // Exhausted retries — surface to the user.
    writeClientTrace({
      runId,
      sessionId,
      eventName: "client.connect.failed",
      level: "error",
      payload: {
        message: err instanceof Error ? err.message : String(err),
        attempts: MAX_CONNECT_ATTEMPTS,
      },
    });
    if (!cancelled) {
      store.update(() => ({
        isRunning: false,
        status: { kind: "idle" },
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  } finally {
    connecting = false;
  }
};
```

#### Rewrite `ensureConnected()` (replaces current lines 488–507)

Adds the cursor-null fallback to `loadSnapshot()`:

```ts
const ensureConnected = async (reason: string) => {
  if (cancelled || recovering) return;
  if (!shouldReconnectRef.current) return;
  cancelPendingRetry();
  const cursor = cursorRef.current;
  if (!cursor) {
    // Run started but no cursor event has arrived yet (e.g. tab was hidden
    // before RUN_STARTED). Fall back to snapshot, which fetches a fresh
    // cursor and will reconnect itself if still running.
    writeClientTrace({
      runId: crypto.randomUUID(),
      sessionId,
      eventName: "client.reconnect.trigger",
      payload: { reason, fallback: "loadSnapshot", reason_detail: "null_cursor" },
    });
    await loadSnapshot();
    return;
  }
  recovering = true;
  try {
    writeClientTrace({
      runId: crypto.randomUUID(),
      sessionId,
      eventName: "client.reconnect.trigger",
      payload: { reason },
    });
    await agent.detachActiveRun();
    if (cancelled) return;
    await connect(cursor);
  } finally {
    recovering = false;
  }
};
```

#### Rewrite listeners (replaces current lines 525–547)

```ts
const handleVisibilityChange = () => {
  if (document.visibilityState === "hidden") {
    cutStream("visibility:hidden");
    return;
  }
  reconnectNow("visibility:visible");
};

const handlePageShow = () => {
  reconnectNow("pageshow");
};

const handleOnline = () => {
  if (document.visibilityState !== "visible") return;
  reconnectNow("online");
};

void loadSnapshot();

document.addEventListener("visibilitychange", handleVisibilityChange);
window.addEventListener("pageshow", handlePageShow);
window.addEventListener("online", handleOnline);

return () => {
  cancelled = true;
  cancelPendingRetry();
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  window.removeEventListener("pageshow", handlePageShow);
  window.removeEventListener("online", handleOnline);
  void agent.abortRun();
};
```

### Worker side

No changes required. The worker:
- Detects client disconnect via `res.on("close", () => cancel("client_disconnected"))` in `transports/http.ts:122-135`.
- Keeps logging events to `SessionEventLog` regardless of subscribers.
- Auto-closes `connectToSession` when terminal arrives or session is idle at connect time.
- Returns 409 on epoch mismatch, triggering the existing cursor-reset recovery path.

## Edge Cases

| # | Scenario | Expected Behavior |
|---|---|---|
| 1 | Hide while run hangs (zombie stream) | `abortRun()` aborts the in-flight fetch; `signal.aborted === true`; no new `/connect` while hidden. |
| 2 | Run completes while hidden | Worker logged terminal event. On show, `/connect` replays the tail including the terminal event; `onEvent` sets `shouldReconnectRef = false`; `connectToSession` auto-closes. |
| 3 | Worker restart while hidden (epoch changed) | On show, `/connect` returns 409. `isCursorResetError` true → one-shot `loadSnapshot()` → reconnect from new cursor. A second 409 surfaces as error (existing behavior, preserved). |
| 4 | `sendMessage` immediately followed by hide (cursor still null) | On show, `ensureConnected` sees `cursorRef.current === null` → calls `loadSnapshot()` → fetches fresh cursor → reconnects from there. |
| 5 | Alt-tab back during an in-flight retry backoff | `ensureConnected` calls `cancelPendingRetry()` first, so a stale retry timer cannot double-connect; a fresh `connect(cursor)` begins. |
| 6 | Unmount with a pending retry timer | Cleanup calls `cancelPendingRetry()` and `agent.abortRun()` — no leaked timers, no orphan fetch. |
| 7 | `sendMessage` issued while already hidden | `runAgent()` opens a fresh `fetch` (no `cutStream` is triggered because `visibilitychange` does not fire). The stream runs in the background, same as today. On the next `hidden → visible` transition, `cutStream` fires first (taking the in-flight stream down cleanly), then `reconnectNow` triggers resume via cursor (or via `loadSnapshot()` if no cursor event arrived). This case is unusual; we do not optimize for it. |
| 8 | Rapid alt-tab while a run is active | Each `hidden` cuts; each `visible` reconnects. Cursor replay handles misses cheaply. No debounce chosen — the user explicitly preferred immediate reconnect. If this proves to thrash the server in practice, a 200–500ms debounce is the obvious follow-up. |

## Tests (`tests/unit/agent-code/use-coding-agent.lifecycle.test.tsx`)

### Updated

1. **`does not reconnect on visibilitychange when idle`** (line 134) — unchanged; `shouldReconnectRef === false` short-circuits `reconnectNow`.
2. **`cuts the stream when hidden and reconnects when shown again`** (rewrite of line 150). Setup: snapshot `running=true` → initial `/connect` hangs forever. Fire `visibilitychange` with `visibilityState="hidden"` → assert the initial connect's `signal.aborted === true` and `/connect` call count stays 1. Set `visibilityState="visible"`, fire `visibilitychange` → waitFor `/connect` call count 2. Drop the `Date.now` spy used by the staleness gate.
3. **`online fires while hidden does not reconnect`** (rename of line 209; body unchanged) — `online` while `visibilityState === "hidden"` is filtered by `reconnectNow`/`handleOnline`. Still asserts no extra `/connect`.
4. **`retries connect with exponential backoff then surfaces error after 4 attempts (3 retries)`** (rewrite of line 248). Use `vi.useFakeTimers()`. Setup: `/connect` always rejects with `new TypeError("network error")`. Trigger initial connect (snapshot `running=true`, connect attempt 0). Advance fake timers: 300ms → connect #1 (retry) rejects; 600ms → connect #2 (retry) rejects; 1200ms → connect #3 (retry) rejects; assert `screen.getByTestId("error").textContent === "network error"` and `/connect` call count === 4. Update the comment — design intent is now "retry transient failures 3x then surface", not "no retry".

### New

5. **`does not surface an error when the cut is deliberate (aborted)`** — snapshot `running=true`, `/connect` hangs. Fire `visibilitychange` with `hidden`, then with `visible`. Assert `screen.getByTestId("error").textContent === ""` and `/connect` call count ends at 2.
6. **`falls back to loadSnapshot when cursorRef is null on reconnect`** — snapshot `running=false` (idle). `sendMessage("hello")` with `/api/agent/code` mocked to hang. Fire `visibilitychange` (`hidden` then `visible`). Assert the snapshot URL is called a second time (fallback path) and `/connect` is invoked with the snapshot's new cursor.
7. **`reconnects on pageshow (iOS bfcache)`** — snapshot `running=true`, initial `/connect` hangs. Fire `pageshow` (no `visibilitychange`). Assert `/connect` call count reaches 2.
8. **`cancels pending retry when ensureConnected fires (race resolver)`** — `/connect` rejects (triggers retry scheduling). With fake timers, do not advance the timer; instead trigger a reconnect via `visibilitychange` (`hidden` then `visible`). Assert `/connect` is invoked exactly once more (not twice — once canceled retry, one new connect).
9. **`cancels pending retry on unmount`** — `/connect` rejects; before the 300ms retry timer fires, unmount. Advance fake timers past 1200ms. Assert `/connect` call count === 1 (no post-unmount retry).

## Trace Events (new)

- `client.stream.cut` — payload `{ reason }`.
- `client.connect.retry` — payload `{ attempt, delayMs, next }`.
- `client.connect.aborted` — payload `{ attempt }`.
- `client.reconnect.trigger` payload gains `{ fallback: "loadSnapshot", reason_detail: "null_cursor" }` when entered via the no-cursor path.

(Existing trace events `client.connect.start`, `client.connect.complete`, `client.connect.failed` are preserved, with `attempt` added to `client.connect.start` and `attempts` added to `client.connect.failed`.)

## Out-of-Scope Notes

- The "stream silently dies while the tab stays visible" gap (no heartbeat) is **not** addressed by this design. With cut-on-hide, the user moving to another tab and back will heal such cases for free, but a long pause on the same tab with a dead socket remains uncovered. A future heartbeat (worker-emitted `CUSTOM ping` every N seconds + client timeout) could close that gap; left for a follow-up spec.
- The "main thread stalls during reconnect" issue the user mentioned is not addressed here; flagged by the user as possibly already fixed.