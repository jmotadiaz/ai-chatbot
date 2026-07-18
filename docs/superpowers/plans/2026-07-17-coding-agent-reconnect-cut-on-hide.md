# Coding Agent Reconnect — Cut-on-Hide + Robust Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-shot reconnect-on-visible path with a deterministic cut-on-hide + immediate-reconnect-on-show state machine, plus exponential backoff (300/600/1200 ms) for transient connect failures, while preserving the cursor/epoch resume protocol.

**Architecture:** All changes are client-side, in `packages/chatbot/`. Two files: `ConnectableHttpAgent` gains a swap-then-abort `abortRun()`; `useCodingAgent`'s main `useEffect` gains a visibility-driven state machine, a retry-with-backoff `connect()`, an abort filter, and a `loadSnapshot()` fallback in `ensureConnected`. No worker changes.

**Tech Stack:** TypeScript, React (useSyncExternalStore), `@ag-ui/client`, Vitest, jsdom, Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-17-coding-agent-reconnect-cut-on-hide-design.md`

**Test command (run after every implementation step):**

```bash
pnpm --filter chatbot test:unit
```

Expected: all green (currently 242 tests pass). New tests added per task.

**Lint/typecheck (run before each commit):**

```bash
pnpm --filter chatbot type:check && pnpm --filter chatbot lint
```

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `packages/chatbot/lib/features/code/connectable-http-agent.ts` | HTTP fetch SSE wrapper for AG-UI; owns the `AbortController` | Modify `abortRun()` (lines 44-46) to swap-then-abort |
| `packages/chatbot/lib/features/code/hooks/use-coding-agent.ts` | React hook owning the stream lifecycle | Modify: remove freshness gate, add cut-on-hide/reconnect-on-show state machine + retry/backoff + abort filter + loadSnapshot fallback |
| `packages/chatbot/tests/unit/agent-code/use-coding-agent.lifecycle.test.tsx` | Lifecycle tests | Rewrite 2 tests, rename 1, keep 1, add 5 new |
| `packages/chatbot/tests/unit/agent-code/connectable-http-agent.test.ts` | `ConnectableHttpAgent` unit tests | Add 2 tests for `abortRun()` |

---

## Task 1: `ConnectableHttpAgent.abortRun()` — swap-then-abort

The current `abortRun()` aborts the controller but never creates a fresh one, so a subsequent `run()`/`connect()` would inherit an aborted signal and fail instantly. This bug is currently latent because `abortRun()` is never called in normal flow. We're about to call it (Task 2), so fix it first.

**Files:**
- Modify: `packages/chatbot/lib/features/code/connectable-http-agent.ts:44-46`
- Test: `packages/chatbot/tests/unit/agent-code/connectable-http-agent.test.ts`

- [ ] **Step 1: Write two failing tests**

Append to the `describe("ConnectableHttpAgent", ...)` block in `tests/unit/agent-code/connectable-http-agent.test.ts`:

```ts
  it("aborts the in-flight fetch's signal when abortRun() is called", async () => {
    let capturedSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn().mockImplementation((_url, init) => {
      capturedSignal = init.signal;
      return new Promise<Response>(() => {}); // never resolves
    });
    const agent = new ConnectableHttpAgent({
      runUrl: "/api/run",
      connectUrl: "/api/connect",
      threadId: "t",
      fetch: fetchImpl,
    });

    agent
      .run({
        threadId: "t",
        runId: "r",
        tools: [],
        context: [],
        forwardedProps: {},
        state: {},
        messages: [],
      })
      .subscribe({ next: () => {}, error: () => {}, complete: () => {} });

    await vi.waitFor(() => expect(capturedSignal).toBeDefined());
    agent.abortRun();
    expect(capturedSignal!.aborted).toBe(true);
  });

  it("resets the AbortController so a subsequent run() is not aborted", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse([
        JSON.stringify({ type: "RUN_FINISHED", threadId: "t", runId: "r2" }),
      ]),
    );
    const agent = new ConnectableHttpAgent({
      runUrl: "/api/run",
      connectUrl: "/api/connect",
      threadId: "t",
      fetch: fetchImpl,
    });

    agent.abortRun(); // would leave a stale aborted controller on the old impl

    await new Promise<void>((resolve, reject) => {
      agent
        .run({
          threadId: "t",
          runId: "r2",
          tools: [],
          context: [],
          forwardedProps: {},
          state: {},
          messages: [],
        })
        .subscribe({ next: () => {}, error: reject, complete: () => resolve() });
    });

    // The second run happened on a fresh controller — sign unborn.
    const [, init2] = fetchImpl.mock.calls[0]!;
    expect((init2.signal as AbortSignal).aborted).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
pnpm --filter chatbot test:unit -- connectable-http-agent
```
Expected: 
- Test 1 ("aborts the in-flight fetch's signal") PASSES reason: the current `abortRun()` already aborts. (Keep this test; it documents the contract.)
- Test 2 ("resets the AbortController so a subsequent run() is not aborted") FAILS: the second `run()` is called on the still-aborted controller, so `fetch` either rejects immediately with AbortError or `init.signal.aborted === true`. The assertion `aborted === false` fails.

(If test 1 also passes, that's expected — it's the "kept" contract test. Move on.)

- [ ] **Step 3: Implement swap-then-abort**

In `packages/chatbot/lib/features/code/connectable-http-agent.ts`, replace the body of `abortRun()` (lines 44-46):

```ts
  abortRun(): void {
    const old = this.abortController;
    this.abortController = new AbortController();
    old.abort();
  }
```

Order matters: install the fresh controller first, then abort the old one. Any in-flight read of `this.abortController` returns the fresh one.

- [ ] **Step 4: Run the tests to verify both pass**

```bash
pnpm --filter chatbot test:unit -- connectable-http-agent
```
Expected: 4 tests pass (2 original + 2 new).

- [ ] **Step 5: Lint/typecheck and commit**

```bash
pnpm --filter chatbot type:check && pnpm --filter chatbot lint
git add packages/chatbot/lib/features/code/connectable-http-agent.ts packages/chatbot/tests/unit/agent-code/connectable-http-agent.test.ts
git commit -m "$(cat <<'EOF'
fix(coding-agent): reset AbortController in ConnectableHttpAgent.abortRun

Swap-then-abort so a subsequent run()/connect() does not inherit an
already-aborted signal. Previously this was latent (abortRun was never
called); cut-on-hide will exercise it.

Co-Authored-By: glm-5.2 <noreply@example.com>
EOF
)"
```

---

## Task 2: Visibility state machine — cut on hide, reconnect immediately on show

Add the `hidden` branch that proactively cuts the stream, replace `reconnectIfStale` with an unconditional `reconnectNow`, and add an abort filter to `connect()` so a deliberate cut does not surface as an error. Removes `RECONNECT_FRESHNESS_MS`, `lastEventAtRef`, and `reconnectIfStale`.

**Files:**
- Modify: `packages/chatbot/lib/features/code/hooks/use-coding-agent.ts` — lines 159-161, 183, 242, 415-432, 509-547
- Test: `packages/chatbot/tests/unit/agent-code/use-coding-agent.lifecycle.test.tsx`

- [ ] **Step 1: Rewrite the failing test for cut-on-hide + reconnect-on-show**

In `tests/unit/agent-code/use-coding-agent.lifecycle.test.tsx`, **replace** the test at line 150 (`reconnects on visibilitychange after the connection goes stale while a run is active`) with:

```ts
  it("cuts the stream when hidden and reconnects when shown again", async () => {
    let connectCallCount = 0;
    fetchSpy.mockReset();
    fetchSpy.mockImplementation((url: string) => {
      if (url === "/api/agent/code/sessions/s/snapshot") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              messages: [],
              cursor: { epoch: "e", seq: 5 },
              running: true,
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (url === "/api/agent/code/connect") {
        connectCallCount += 1;
        if (connectCallCount === 1) {
          // The initial connect hangs forever — simulates a stream that
          // the user navigates away from while it is still flowing.
          const encoder = new TextEncoder();
          return Promise.resolve(
            new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: "RUN_STARTED",
                        threadId: "s",
                        runId: "r1",
                      })}\n\n`,
                    ),
                  );
                },
              }),
              { headers: { "Content-Type": "text/event-stream" } },
            ),
          );
        }
        return Promise.resolve(
          makeSseResponse([
            { type: "RUN_STARTED", threadId: "s", runId: "r2" },
            { type: "RUN_FINISHED", threadId: "s", runId: "r2" },
          ]),
        );
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });

    render(<Harness />);
    await waitFor(() => expect(connectCallCount).toBe(1));

    // Hide the tab — the in-flight fetch must be aborted.
    const [, firstConnectInit] = fetchSpy.mock.calls.find(
      ([url]) => url === "/api/agent/code/connect",
    )!;
    const firstSignal = (firstConnectInit as RequestInit).signal as AbortSignal;

    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    await act(async () => {
      fireEvent(document, new Event("visibilitychange"));
    });
    expect(firstSignal.aborted).toBe(true);
    expect(connectCallCount).toBe(1); // no reconnect while hidden

    // Show the tab — reconnect immediately from the last cursor.
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    await act(async () => {
      fireEvent(document, new Event("visibilitychange"));
    });

    await waitFor(() => expect(connectCallCount).toBe(2));

    const [, secondConnectInit] = fetchSpy.mock.calls
      .filter(([url]) => url === "/api/agent/code/connect")[1]!;
    expect(JSON.parse((secondConnectInit as RequestInit).body as string)).toEqual(
      expect.objectContaining({
        forwardedProps: { afterSeq: 5, epoch: "e" },
      }),
    );
  });
```

- [ ] **Step 2: Add the "no error on deliberate abort" test**

Append to the `describe` block:

```ts
  it("does not surface an error when the cut is deliberate (aborted)", async () => {
    let connectCallCount = 0;
    fetchSpy.mockReset();
    fetchSpy.mockImplementation((url: string) => {
      if (url === "/api/agent/code/sessions/s/snapshot") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              messages: [],
              cursor: { epoch: "e", seq: 5 },
              running: true,
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (url === "/api/agent/code/connect") {
        connectCallCount += 1;
        if (connectCallCount === 1) {
          // Hangs forever — gets cut when we hide.
          const encoder = new TextEncoder();
          return Promise.resolve(
            new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: "RUN_STARTED",
                        threadId: "s",
                        runId: "r1",
                      })}\n\n`,
                    ),
                  );
                },
              }),
              { headers: { "Content-Type": "text/event-stream" } },
            ),
          );
        }
        return Promise.resolve(
          makeSseResponse([
            { type: "RUN_STARTED", threadId: "s", runId: "r2" },
            { type: "RUN_FINISHED", threadId: "s", runId: "r2" },
          ]),
        );
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });

    render(<Harness />);
    await waitFor(() => expect(connectCallCount).toBe(1));

    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    await act(async () => {
      fireEvent(document, new Event("visibilitychange"));
    });

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    await act(async () => {
      fireEvent(document, new Event("visibilitychange"));
    });

    await waitFor(() => expect(connectCallCount).toBe(2));
    expect(screen.getByTestId("error").textContent).toBe("");
  });
```

- [ ] **Step 3: Add the "pageshow reconnects" test**

```ts
  it("reconnects on pageshow (iOS bfcache restore)", async () => {
    let connectCallCount = 0;
    fetchSpy.mockReset();
    fetchSpy.mockImplementation((url: string) => {
      if (url === "/api/agent/code/sessions/s/snapshot") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              messages: [],
              cursor: { epoch: "e", seq: 5 },
              running: true,
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (url === "/api/agent/code/connect") {
        connectCallCount += 1;
        if (connectCallCount === 1) {
          const encoder = new TextEncoder();
          return Promise.resolve(
            new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: "RUN_STARTED",
                        threadId: "s",
                        runId: "r1",
                      })}\n\n`,
                    ),
                  );
                },
              }),
              { headers: { "Content-Type": "text/event-stream" } },
            ),
          );
        }
        return Promise.resolve(
          makeSseResponse([
            { type: "RUN_STARTED", threadId: "s", runId: "r2" },
            { type: "RUN_FINISHED", threadId: "s", runId: "r2" },
          ]),
        );
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });

    render(<Harness />);
    await waitFor(() => expect(connectCallCount).toBe(1));

    await act(async () => {
      fireEvent(window, new Event("pageshow"));
    });

    await waitFor(() => expect(connectCallCount).toBe(2));
  });
```

- [ ] **Step 4: Rename the existing "backgrounded" test**

In the test at line 209 (`does not reconnect on visibilitychange while the tab is backgrounded`), change the `it(...)` title to:

```ts
  it("online fires while hidden does not reconnect", async () => {
```

Body unchanged.

- [ ] **Step 5: Run the tests to verify the new behavior fails (red)**

```bash
pnpm --filter chatbot test:unit -- use-coding-agent.lifecycle
```
Expected:
- "cuts the stream when hidden and reconnects when shown again" FAILS: without the `hidden` branch, `firstSignal.aborted` stays `false`.
- "does not surface an error when the cut is deliberate (aborted)" FAILS: aborted connect surfaces as error.
- "reconnects on pageshow (iOS bfcache restore)" — may PASS or FAIL depending on jsdom defaults; if `pageshow` already triggered `reconnectIfStale` and freshness gate skipped due to `Date.now` returning large default, this might pass today. After we remove `reconnectIfStale`, it must still pass via `reconnectNow`.
- The kept tests (`does not reconnect on visibilitychange when idle` line 134, renamed `online fires while hidden...`) PASS already.
- The renamed test (`online fires while hidden...`) changes only its title; body still passes.

(The `surfaces a genuine connection failure...` test at line 248 still passes against current code — Task 3 rewrites it.)

- [ ] **Step 6: Implement — remove freshness gate** 

In `packages/chatbot/lib/features/code/hooks/use-coding-agent.ts`:

(a) Delete lines 159-161 (the comment + `RECONNECT_FRESHNESS_MS`):
```ts
// Below this, a reconnect is skipped as redundant: an event that recent means
// the stream is still alive, so a visibility/pageshow/online trigger is noise.
const RECONNECT_FRESHNESS_MS = 3000;
```

(b) Delete line 183 (`const lastEventAtRef = useRef(0);`).

(c) Delete line 242 (`lastEventAtRef.current = Date.now();`) inside `onEvent`.

- [ ] **Step 7: Implement — abort filter in `connect()`**

Replace the `catch` body of `connect()` (lines 413-432) so it swallows deliberate aborts. Old:

```ts
      } catch (err) {
        if (!cancelled && isCursorResetError(err) && !retriedAfterCursorReset) {
          retriedAfterCursorReset = true;
          reloadAfterCursorReset = true;
        } else {
          writeClientTrace({
            runId,
            sessionId,
            eventName: "client.connect.failed",
            level: "error",
            payload: { message: err instanceof Error ? err.message : String(err) },
          });
          if (!cancelled) {
            store.update(() => ({
              isRunning: false,
              status: { kind: "idle" },
              error: err instanceof Error ? err.message : String(err),
            }));
          }
        }
      } finally {
        connecting = false;
      }
      if (reloadAfterCursorReset && !cancelled) {
        await loadSnapshot();
      }
    };
```

New:

```ts
      } catch (err) {
        if (!cancelled && isCursorResetError(err) && !retriedAfterCursorReset) {
          retriedAfterCursorReset = true;
          reloadAfterCursorReset = true;
        } else if (isAbortError(err)) {
          // Deliberate cut (e.g. tab hidden). Swallow silently — the next
          // visibility:visible will reconnect from the last cursor.
          writeClientTrace({
            runId,
            sessionId,
            eventName: "client.connect.aborted",
            payload: { attempt: 0 },
          });
        } else {
          writeClientTrace({
            runId,
            sessionId,
            eventName: "client.connect.failed",
            level: "error",
            payload: { message: err instanceof Error ? err.message : String(err) },
          });
          if (!cancelled) {
            store.update(() => ({
              isRunning: false,
              status: { kind: "idle" },
              error: err instanceof Error ? err.message : String(err),
            }));
          }
        }
      } finally {
        connecting = false;
      }
      if (reloadAfterCursorReset && !cancelled) {
        await loadSnapshot();
      }
    };
```

Add the `isAbortError` helper at module scope (next to `isCursorResetError` around line 148):

```ts
function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const name = err.name.toLowerCase();
  const msg = err.message.toLowerCase();
  return name === "aborterror" || /aborted|fetch is aborted/.test(msg);
}
```

Remove the now-unused `let reloadAfterCursorReset = false;` declaration? No — keep it. The cursor-reset path still uses it. (Re-read to confirm: the current line 394 `let reloadAfterCursorReset = false;` is used by both the `if (isCursorResetError)` branch and the post-try block. Keep as-is.)

- [ ] **Step 8: Implement — replace `reconnectIfStale` with `reconnectNow`; add `cutStream`, `cancelPendingRetry`**

Replace lines 509-547 (`reconnectIfStale` through the cleanup `return () => { ... }`) with:

```ts
    // Forward-use: Task 3 will schedule retry timers; ensureConnected and
    // cleanup cancel any pending retry before triggering/tearing down.
    let pendingRetryTimer: ReturnType<typeof setTimeout> | null = null;
    const cancelPendingRetry = () => {
      if (pendingRetryTimer) {
        clearTimeout(pendingRetryTimer);
        pendingRetryTimer = null;
      }
    };

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

    const reconnectNow = (reason: string) => {
      if (cancelled || recovering) return;
      if (!shouldReconnectRef.current) return;
      void ensureConnected(reason);
    };

    void loadSnapshot();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        cutStream("visibility:hidden");
        return;
      }
      reconnectNow("visibility:visible");
    };
    // iOS Safari can restore a frozen page from bfcache without re-running
    // effects or firing visibilitychange — pageshow is the reliable signal.
    const handlePageShow = () => {
      reconnectNow("pageshow");
    };
    const handleOnline = () => {
      if (document.visibilityState !== "visible") return;
      reconnectNow("online");
    };

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

Note: also update the cleanup's last line from `void agent.detachActiveRun();` to `void agent.abortRun();` (real abort, not just RxJS detach).

Also delete the now-unused `recovering` declaration's surrounding comment block (lines 479-484)? Keep the `let recovering = false;` (lines 484) and its comment, since `ensureConnected` still owns `recovering`. Just delete the stale `reconnectIfStale` comment block (lines 509-512).

- [ ] **Step 9: Run the tests to verify green**

```bash
pnpm --filter chatbot test:unit -- use-coding-agent.lifecycle
```
Expected: all tests in this file pass, including:
- `cuts the stream when hidden and reconnects when shown again`
- `does not surface an error when the cut is deliberate (aborted)`
- `reconnects on pageshow (iOS bfcache restore)`
- `does not reconnect on visibilitychange when idle`
- `online fires while hidden does not reconnect`
- `connects an active session from the cursor returned by the worker snapshot`
- `surfaces a genuine connection failure as an error instead of retrying silently in the background` (still passing in its existing form — flagged for rewrite in Task 3)

- [ ] **Step 10: Run the full unit suite**

```bash
pnpm --filter chatbot test:unit
```
Expected: all green.

- [ ] **Step 11: Lint/typecheck and commit**

```bash
pnpm --filter chatbot type:check && pnpm --filter chatbot lint
git add packages/chatbot/lib/features/code/hooks/use-coding-agent.ts packages/chatbot/tests/unit/agent-code/use-coding-agent.lifecycle.test.tsx
git commit -m "$(cat <<'EOF'
feat(coding-agent): cut stream on tab hide, reconnect immediately on show

Replace the freshness-gated reconnect-on-visible path with a deterministic
state machine: abort the in-flight fetch when the tab becomes hidden
(worker is notified via res.close), and reconnect from the last cursor
the moment the tab becomes visible again. Adds an AbortError filter to
connect() so a deliberate cut is not surfaced as a user-facing error.
Removes RECONNECT_FRESHNESS_MS and lastEventAtRef.

Co-Authored-By: glm-5.2 <noreply@example.com>
EOF
)"
```

---

## Task 3: Retry transient connect failures with exponential backoff

A transient `fetch` failure (e.g. Safari "TypeError: network error" on wifi reattach) currently surfaces as an error after one attempt. Replace with three retries at 300/600/1200 ms before surfacing. Also wire `cancelPendingRetry` into `ensureConnected` so a reconnect triggered while a retry is pending does not double-connect, and ensure cleanup cancels any pending retry.

**Files:**
- Modify: `packages/chatbot/lib/features/code/hooks/use-coding-agent.ts` — `connect()` body, `ensureConnected()` body, module constants
- Test: `packages/chatbot/tests/unit/agent-code/use-coding-agent.lifecycle.test.tsx`

- [ ] **Step 1: Rewrite the "surfaces a genuine connection failure" test to expect retries**

In `tests/unit/agent-code/use-coding-agent.lifecycle.test.tsx`, replace the test at line 248 (`surfaces a genuine connection failure as an error instead of retrying silently in the background`) with:

```ts
  it("retries connect with exponential backoff then surfaces error after 4 attempts (3 retries)", async () => {
    let connectCallCount = 0;
    fetchSpy.mockReset();
    fetchSpy.mockImplementation((url: string) => {
      if (url === "/api/agent/code/sessions/s/snapshot") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              messages: [],
              cursor: { epoch: "e", seq: 5 },
              running: true,
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (url === "/api/agent/code/connect") {
        connectCallCount += 1;
        return Promise.reject(new TypeError("network error"));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });

    vi.useFakeTimers();

    try {
      render(<Harness />);

      // Initial connect (attempt 0) — fires from loadSnapshot path.
      await waitFor(() => expect(connectCallCount).toBe(1));

      // Retry 1 at +300ms
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(connectCallCount).toBe(2);

      // Retry 2 at +600ms
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });
      expect(connectCallCount).toBe(3);

      // Retry 3 at +1200ms — exhausted, error surfaces
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1200);
      });
      expect(connectCallCount).toBe(4);

      await waitFor(() =>
        expect(screen.getByTestId("error").textContent).toBe("network error"),
      );
    } finally {
      vi.useRealTimers();
    }
  });
```

- [ ] **Step 2: Add "cancel pending retry on reconnect race" test**

```ts
  it("cancels a pending retry when ensureConnected fires (race resolver)", async () => {
    let connectCallCount = 0;
    fetchSpy.mockReset();
    fetchSpy.mockImplementation((url: string) => {
      if (url === "/api/agent/code/sessions/s/snapshot") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              messages: [],
              cursor: { epoch: "e", seq: 5 },
              running: true,
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (url === "/api/agent/code/connect") {
        connectCallCount += 1;
        return Promise.reject(new TypeError("network error"));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });

    vi.useFakeTimers();

    try {
      render(<Harness />);
      await waitFor(() => expect(connectCallCount).toBe(1));

      // Wait long enough for the first retry to be scheduled (300ms) but
      // do NOT advance past it — the timer is pending.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      // A reconnect trigger arrives before the retry fires. It must cancel
      // the pending retry — else we'd get both the stale retry and the new
      // connect firing close together.
      await act(async () => {
        fireEvent(window, new Event("pageshow"));
      });

      // Only ONE new connect should fire from this trigger (the retry was
      // canceled), bringing the count to 2 — not 3.
      await waitFor(() => expect(connectCallCount).toBe(2));
      expect(connectCallCount).toBe(2);

      // Advance past the original 300ms retry deadline to prove the timer
      // was really canceled — no extra connection.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(connectCallCount).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
```

- [ ] **Step 3: Add "cancel pending retry on unmount" test**

```ts
  it("cancels a pending retry timer on unmount", async () => {
    let connectCallCount = 0;
    fetchSpy.mockReset();
    fetchSpy.mockImplementation((url: string) => {
      if (url === "/api/agent/code/sessions/s/snapshot") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              messages: [],
              cursor: { epoch: "e", seq: 5 },
              running: true,
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (url === "/api/agent/code/connect") {
        connectCallCount += 1;
        return Promise.reject(new TypeError("network error"));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });

    vi.useFakeTimers();

    try {
      const { unmount } = render(<Harness />);
      await waitFor(() => expect(connectCallCount).toBe(1));

      // Advance partway so the retry timer is scheduled but not fired.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      unmount();

      // Advance well past the longest backoff — a leaked retry would surface
      // either as a new connect or a console error.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(connectCallCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
```

- [ ] **Step 4: Run tests to verify red**

```bash
pnpm --filter chatbot test:unit -- use-coding-agent.lifecycle
```
Expected:
- "retries connect with exponential backoff then surfaces error after 4 attempts (3 retries)" FAILS: today connect makes 1 attempt and immediately surfaces. `connectCallCount` stays at 1 after advancing 300ms.
- "cancels a pending retry when ensureConnected fires (race resolver)" FAILS: no retry timer exists today, so `pageshow` triggers connect #2 regardless — but then the assertion `expect(connectCallCount).toBe(2)` might pass by accident. The stronger assertion at the end (`advance 1000ms more, still 2`) passes today too. Hmm — this test may already pass. Keep it anyway; it will fail meaningfully if we ever regress the cancel-on-race path. After implementation, the path through `cancelPendingRetry()` in `ensureConnected` is what makes the new "still 2" assertion robust against future retry-timer regressions.
- "cancels a pending retry timer on unmount" PASS today (no retry to cancel). Will become a real guard after implementation.

- [ ] **Step 5: Implement — add module constants**

In `packages/chatbot/lib/features/code/hooks/use-coding-agent.ts`, near the top of the file (where `RECONNECT_FRESHNESS_MS` used to be — now empty), add:

```ts
const MAX_CONNECT_ATTEMPTS = 4; // 1 initial + 3 retries
const CONNECT_BACKOFF_MS = [300, 600, 1200]; // delay before retry attempts 1, 2, 3
```

Semantics: `connect(cursor, attempt)` is called with `attempt = 0` on the initial try. On a transient failure it schedules `connect(cursor, attempt + 1)` after `CONNECT_BACKOFF_MS[attempt]` ms, provided `attempt + 1 < MAX_CONNECT_ATTEMPTS`. The 4th attempt fails (attempt index 3); `attempt + 1 === 4` is not `< 4`, so we surface.

- [ ] **Step 6: Implement — rewrite `connect()` with retry+backoff**

Replace the entire `connect()` function (lines 391-439) with:

```ts
    const connect = async (cursor: SessionCursor, attempt = 0) => {
      if (cancelled || connecting) return;
      connecting = true;
      let reloadAfterCursorReset = false;
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
        if (isCursorResetError(err) && !retriedAfterCursorReset) {
          retriedAfterCursorReset = true;
          reloadAfterCursorReset = true;
        } else if (isAbortError(err)) {
          // Deliberate cut (e.g. tab hidden). Swallow silently.
          writeClientTrace({
            runId,
            sessionId,
            eventName: "client.connect.aborted",
            payload: { attempt },
          });
        } else if (attempt + 1 < MAX_CONNECT_ATTEMPTS) {
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
        } else {
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
        }
      } finally {
        connecting = false;
      }
      if (reloadAfterCursorReset && !cancelled) {
        await loadSnapshot();
      }
    };
```

Note: the `pendingRetryTimer` and `cancelPendingRetry` are declared later in the effect (added in Task 2). They are in scope because JavaScript hoists the `let` declarations... Actually `let` does NOT hoist for TDZ. Since `connect` is referenced before `cancelPendingRetry`'s declaration line in source order, but `connect` is only *invoked* at runtime after the effect body has fully initialized (via `loadSnapshot` which is called after the declarations), the closure captures them fine. To keep the code readable, **move** the `pendingRetryTimer`/`cancelPendingRetry` block to **just below the `let recovering = false;` declaration** (i.e. above `ensureConnected`). This guarantees source-order readability. The `cutStream` and `reconnectNow` helpers remain where Task 2 placed them (further down, near the listeners) — they don't need to move because they are only called from the listener registrations, which run last.

- [ ] **Step 7: Implement — `ensureConnected` cancels pending retry**

Replace the body of `ensureConnected` (lines 488-507 from the original; now wherever Task 2 placed it). Add `cancelPendingRetry()` at the top — after the early returns:

```ts
    const ensureConnected = async (reason: string) => {
      if (cancelled || recovering) return;
      if (!shouldReconnectRef.current) return;
      cancelPendingRetry();
      const cursor = cursorRef.current;
      if (!cursor) return;
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

(Task 4 adds the `loadSnapshot()` fallback in the `if (!cursor)` branch.)

- [ ] **Step 8: Run the tests to verify green**

```bash
pnpm --filter chatbot test:unit -- use-coding-agent.lifecycle
```
Expected: all tests pass, including the three retry-related new tests.

- [ ] **Step 9: Run the full unit suite**

```bash
pnpm --filter chatbot test:unit
```
Expected: all green.

- [ ] **Step 10: Lint/typecheck and commit**

```bash
pnpm --filter chatbot type:check && pnpm --filter chatbot lint
git add packages/chatbot/lib/features/code/hooks/use-coding-agent.ts packages/chatbot/tests/unit/agent-code/use-coding-agent.lifecycle.test.tsx
git commit -m "$(cat <<'EOF'
feat(coding-agent): retry transient connect failures with backoff

Replace the one-shot surface-on-failure behavior in connect() with 3
retries at 300/600/1200 ms before surfacing the error. ensureConnected
cancels any pending retry before reconnecting (no double-connect race);
cleanup cancels it too so timers don't leak past unmount.

Co-Authored-By: glm-5.2 <noreply@example.com>
EOF
)"
```

---

## Task 4: `loadSnapshot()` fallback in `ensureConnected` on null cursor

Today `ensureConnected` returns silently if `cursorRef.current === null`, leaving the UI stuck when a run started but no cursor event ever arrived (e.g. tab hidden between `sendMessage` and the first server event). Fall back to `loadSnapshot()`, which fetches a fresh cursor and reconnects itself.

**Files:**
- Modify: `packages/chatbot/lib/features/code/hooks/use-coding-agent.ts` — `ensureConnected()` (the `if (!cursor)` branch)
- Test: `packages/chatbot/tests/unit/agent-code/use-coding-agent.lifecycle.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to the `describe` block:

```ts
  it("falls back to loadSnapshot when cursorRef is null on reconnect", async () => {
    let snapshotCallCount = 0;
    let runStarted = false;
    fetchSpy.mockReset();
    fetchSpy.mockImplementation((url: string) => {
      if (url === "/api/agent/code/sessions/s/snapshot") {
        snapshotCallCount += 1;
        // First load: idle, no cursor. Second load (fallback): now running
        // with a fresh cursor that the sendMessage produced.
        const running = snapshotCallCount === 2;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              messages: [],
              cursor: running ? { epoch: "e", seq: 9 } : null,
              running,
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (url === "/api/agent/code") {
        // sendMessage's run — emit RUN_STARTED then hang (no cursor event
        // ever arrives, because the server would emit the cursor interleaved
        // with content; here we simulate a race where it didn't land yet).
        runStarted = true;
        const encoder = new TextEncoder();
        return Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "RUN_STARTED",
                      threadId: "s",
                      runId: "r-send",
                    })}\n\n`,
                  ),
                );
              },
            }),
            { headers: { "Content-Type": "text/event-stream" } },
          ),
        );
      }
      if (url === "/api/agent/code/connect") {
        return Promise.resolve(
          makeSseResponse([
            { type: "RUN_STARTED", threadId: "s", runId: "r-reconnect" },
            { type: "RUN_FINISHED", threadId: "s", runId: "r-reconnect" },
          ]),
        );
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });

    render(<Harness />);
    await waitFor(() => expect(snapshotCallCount).toBe(1));

    // Send a message — sets shouldReconnectRef=true, but no cursor arrives.
    await act(async () => {
      fireEvent.click(screen.getByTestId("send"));
    });
    await waitFor(() => expect(runStarted).toBe(true));

    // Hide → cut (cleanup of zin-flight run). Show → reconnect.
    // At show time cursorRef is null — fallback must trigger a second
    // loadSnapshot, which returns running=true with cursor, and reconnect.
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    await act(async () => {
      fireEvent(document, new Event("visibilitychange"));
    });

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    await act(async () => {
      fireEvent(document, new Event("visibilitychange"));
    });

    await waitFor(() => expect(snapshotCallCount).toBe(2));

    // The fallback snapshot returned running=true with cursor -> connect.
    await waitFor(() =>
      expect(
        fetchSpy.mock.calls.some(([url]) => url === "/api/agent/code/connect"),
      ).toBe(true),
    );
    const connectInit = fetchSpy.mock.calls.find(
      ([url]) => url === "/api/agent/code/connect",
    )![1] as RequestInit;
    expect(JSON.parse(connectInit.body as string)).toEqual(
      expect.objectContaining({
        forwardedProps: { afterSeq: 9, epoch: "e" },
      }),
    );
  });
```

- [ ] **Step 2: Run the test to verify red**

```bash
pnpm --filter chatbot test:unit -- use-coding-agent.lifecycle
```
Expected: "falls back to loadSnapshot when cursorRef is null on reconnect" FAILS: current `ensureConnected` returns silently at `if (!cursor) return;`, so `snapshotCallCount` stays 1.

- [ ] **Step 3: Implement — `loadSnapshot()` fallback in `ensureConnected`**

Replace the `if (!cursor) return;` line in `ensureConnected` (wherever Task 3 placed it) with:

```ts
    const ensureConnected = async (reason: string) => {
      if (cancelled || recovering) return;
      if (!shouldReconnectRef.current) return;
      cancelPendingRetry();
      const cursor = cursorRef.current;
      if (!cursor) {
        // Run started but no cursor event has arrived yet (e.g. tab was
        // hidden before RUN_STARTED). Fall back to snapshot, which fetches
        // a fresh cursor and will reconnect itself if still running.
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

- [ ] **Step 4: Run the test to verify green**

```bash
pnpm --filter chatbot test:unit -- use-coding-agent.lifecycle
```
Expected: all green, including the new fallback test.

- [ ] **Step 5: Run the full unit suite**

```bash
pnpm --filter chatbot test:unit
```
Expected: all green.

- [ ] **Step 6: Lint/typecheck and commit**

```bash
pnpm --filter chatbot type:check && pnpm --filter chatbot lint
git add packages/chatbot/lib/features/code/hooks/use-coding-agent.ts packages/chatbot/tests/unit/agent-code/use-coding-agent.lifecycle.test.tsx
git commit -m "$(cat <<'EOF'
feat(coding-agent): fall back to loadSnapshot when cursor is null on reconnect

ensureConnected used to return silently when no cursor event had arrived
yet (e.g. tab hidden between sendMessage and RUN_STARTED), leaving the
UI stuck. Now it reloads the snapshot, which fetches a fresh cursor and
reconnects from there.

Co-Authored-By: glm-5.2 <noreply@example.com>
EOF
)"
```

---

## Self-Review Notes

**Spec coverage:**
- Cut-on-hide state machine — Task 2.
- Immediate reconnect-on-show (no debounce, no freshness gate) — Task 2.
- `pageshow` reconnect — Task 2.
- `online` filtered when hidden — Task 2 (rename, body passes).
- `abortRun()` swap-then-abort — Task 1.
- Retry+backoff (300/600/1200, 3 retries = 4 total attempts) — Task 3.
- AbortError swallow in `connect()` — Task 2 (Steps 7) implemented before retry so cut-on-hide does not surface errors.
- `loadSnapshot()` fallback on null cursor — Task 4.
- `cancelPendingRetry` in `ensureConnected` and cleanup — Task 3 (Step 7) and Task 2 (Step 8 cleanup already calls `cancelPendingRetry` — the helper exists from Task 2 even though no retry timer exists yet; harmless).
- Trace events `client.stream.cut`, `client.connect.retry`, `client.connect.aborted` — added inline in Tasks 2 and 3. `client.connect.start` gains `attempt` field; `client.connect.failed` gains `attempts` — added in Tasks 2 and 3 respectively.

**Placeholder scan:** no TBD/TODO/`fill in` in plan.

**Type consistency:** constants `MAX_CONNECT_ATTEMPTS` (4) and `CONNECT_BACKOFF_MS` (array of 3 delays) referenced consistently across Task 3's `connect()` body and tests. `isAbortError` signature `(err: unknown): boolean` matches the `isCursorResetError` pattern already in the file. `cutStream(reason: string)` and `reconnectNow(reason: string)` signatures used consistently in Task 2 listeners.

**Edge case tests:** #1 (hide while hanging) covered by "cuts the stream when hidden..." — Task 2. #2 (run completes while hidden) is implicitly handled by the existing cursor replay; not separately tested (worker auto-closes `connectToSession` on terminal). #3 (worker restart, 409) is already covered by the existing cursor-reset recovery path — not retested (unchanged). #4 (cursor null) — Task 4. #5 (race) — Task 3 "cancels a pending retry...". #6 (unmount leak) — Task 3 "cancels a pending retry timer on unmount". #7 (sendMessage while hidden) — explicitly noted in spec as not optimized; a dedicated test is out of scope. #8 (rapid alt-tab) — covered structurally by the state machine; not separately tested.