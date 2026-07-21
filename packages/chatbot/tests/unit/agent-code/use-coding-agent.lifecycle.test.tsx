// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  act,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import type { InputContent } from "@ag-ui/client";
import { useCodingAgent } from "@/lib/features/code/hooks/use-coding-agent";

function makeSseResponse(events: object[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const e of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        }
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

// Models what a real browser does with an in-flight SSE response when the
// request is aborted: the fetch promise has already resolved, so the abort
// errors the *body stream* (Safari words it "BodyStreamBuffer was aborted").
// @ag-ui/client then converts that AbortError into an in-band RUN_ERROR event
// with code "abort" instead of rejecting the run promise.
function makeHangingSseResponse(
  events: object[],
  signal?: AbortSignal | null,
): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const e of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        }
        signal?.addEventListener("abort", () => {
          controller.error(
            Object.assign(new Error("BodyStreamBuffer was aborted"), {
              name: "AbortError",
            }),
          );
        });
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

function Harness() {
  const [, setTick] = useState(0);
  const { messages, sendMessage, error, isRunning } = useCodingAgent({
    project: "p",
    sessionId: "s",
    modelId: "m",
  });
  return (
    <div>
      <button data-testid="rerender" onClick={() => setTick((t) => t + 1)}>
        rerender
      </button>
      <button data-testid="send" onClick={() => void sendMessage("hello")}>
        send
      </button>
      <p data-testid="error">{error ?? ""}</p>
      <p data-testid="is-running">{String(isRunning)}</p>
      {messages.map((m) => (
        <p key={m.id} data-testid={`m-${m.role}`}>
          {String(m.content)}
        </p>
      ))}
    </div>
  );
}

const ATTACHMENT_CONTENT: InputContent[] = [
  { type: "text", text: "look at this" },
  {
    type: "image",
    source: { type: "data", value: "aW1hZ2U=", mimeType: "image/png" },
    metadata: { filename: "cat.png" },
  },
];

function AttachmentHarness() {
  const { sendMessage } = useCodingAgent({ project: "p", sessionId: "s", modelId: "m" });
  return (
    <button data-testid="send-attachment" onClick={() => void sendMessage(ATTACHMENT_CONTENT)}>
      send
    </button>
  );
}

describe("useCodingAgent client lifecycle", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        messages: [],
        cursor: null,
        running: false,
      }), {
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValue(
      makeSseResponse([
        { type: "RUN_STARTED", threadId: "s", runId: "r" },
        { type: "RUN_FINISHED", threadId: "s", runId: "r" },
      ]),
      );
    global.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows the user message after send, even when a re-render happens before send (no dual-agent drift)", async () => {
    render(<Harness />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    // Simulate a parent re-render between mount and send (the real cause is
    // AgentCodeChat's input state changing, which makes the hook re-run and
    // pick up the agent that the useEffect created in the background).
    fireEvent.click(screen.getByTestId("rerender"));

    await act(async () => {
      fireEvent.click(screen.getByTestId("send"));
    });

    const userMsg = await screen.findByTestId("m-user", undefined, {
      timeout: 2000,
    });
    expect(userMsg.textContent).toBe("hello");
  });

  it("sends structured InputContent[] (image attachment) through to the run request intact", async () => {
    render(<AttachmentHarness />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    await act(async () => {
      fireEvent.click(screen.getByTestId("send-attachment"));
    });

    await waitFor(() =>
      expect(fetchSpy.mock.calls.some(([url]) => url === "/api/agent/code")).toBe(true),
    );
    const [, request] = fetchSpy.mock.calls.find(([url]) => url === "/api/agent/code")!;
    const body = JSON.parse((request as RequestInit).body as string);
    const messages = body.messages as Array<{ role: string; content: unknown }>;
    const lastUserMessage = messages[messages.length - 1];
    expect(lastUserMessage.role).toBe("user");
    expect(lastUserMessage.content).toEqual(ATTACHMENT_CONTENT);
  });

  it("connects an active session from the cursor returned by the worker snapshot", async () => {
    fetchSpy.mockReset();
    fetchSpy.mockImplementation((url: string) => {
      if (url === "/api/agent/code/sessions/s/snapshot") {
        return Promise.resolve(new Response(JSON.stringify({
          messages: [],
          cursor: { epoch: "worker-epoch", seq: 12 },
          running: true,
        }), {
          headers: { "Content-Type": "application/json" },
        }));
      }
      if (url === "/api/agent/code/connect") {
        return Promise.resolve(makeSseResponse([
          { type: "RUN_STARTED", threadId: "s", runId: "connect-r" },
          { type: "RUN_FINISHED", threadId: "s", runId: "connect-r" },
        ]));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    render(<Harness />);

    await waitFor(() => expect(
      fetchSpy.mock.calls.some(([url]) => url === "/api/agent/code/connect"),
    ).toBe(true));
    const [, request] = fetchSpy.mock.calls.find(
      ([url]) => url === "/api/agent/code/connect",
    )!;
    expect(JSON.parse(request.body)).toEqual(expect.objectContaining({
      forwardedProps: { afterSeq: 12, epoch: "worker-epoch" },
    }));
  });

  it("does not reconnect on visibilitychange when idle", async () => {
    render(<Harness />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    fetchSpy.mockClear();
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    fireEvent(document, new Event("visibilitychange"));

    // Nothing to resume (shouldReconnectRef is false), so no fetch should fire.
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("cuts the stream when hidden and reconnects when shown again", async () => {
    let connectCallCount = 0;
    fetchSpy.mockReset();
    fetchSpy.mockImplementation((url: string, init?: RequestInit) => {
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
          // The initial connect hangs until the cut aborts it — simulates a
          // stream that the user navigates away from while it is flowing.
          return Promise.resolve(
            makeHangingSseResponse(
              [{ type: "RUN_STARTED", threadId: "s", runId: "r1" }],
              init?.signal,
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
    // The run is still active server-side; the in-band RUN_ERROR (code
    // "abort") produced by the cut must not flip the UI to idle/error.
    expect(screen.getByTestId("is-running").textContent).toBe("true");
    expect(screen.getByTestId("error").textContent).toBe("");

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

  it("online fires while hidden does not reconnect", async () => {
    let connectCallCount = 0;
    fetchSpy.mockReset();
    fetchSpy.mockImplementation((url: string) => {
      if (url === "/api/agent/code/sessions/s/snapshot") {
        return Promise.resolve(new Response(JSON.stringify({
          messages: [],
          cursor: { epoch: "e", seq: 5 },
          running: true,
        }), { headers: { "Content-Type": "application/json" } }));
      }
      if (url === "/api/agent/code/connect") {
        connectCallCount += 1;
        // Never terminates — a second call only happens if something wrongly
        // reconnects while the tab is hidden.
        return Promise.resolve(makeSseResponse([
          { type: "RUN_STARTED", threadId: "s", runId: `r${connectCallCount}` },
        ]));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
      writable: true,
    });

    render(<Harness />);
    await waitFor(() => expect(connectCallCount).toBe(1));

    // "online" firing while backgrounded (e.g. wifi reconnecting behind the
    // app) must not trigger a reconnect either.
    fireEvent(window, new Event("online"));

    await new Promise((r) => setTimeout(r, 50));
    expect(connectCallCount).toBe(1);
  });

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

      // Flush microtasks so the initial loadSnapshot -> connect completes.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(connectCallCount).toBe(1);

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

      expect(screen.getByTestId("error").textContent).toBe("network error");
    } finally {
      vi.useRealTimers();
    }
  });

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
        // First connect attempt fails (will schedule retry). Second attempt
        // succeeds so that the ensureConnected-triggered connect does not add
        // its own retry to the count — this isolates the "cancel pending
        // retry" behavior being tested.
        if (connectCallCount === 1) {
          return Promise.reject(new TypeError("network error"));
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

    vi.useFakeTimers();

    try {
      render(<Harness />);

      // Flush microtasks so the initial connect completes.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(connectCallCount).toBe(1);

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

      // Flush microtasks so connect() called via ensureConnected completes.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // Only ONE new connect should fire from this trigger (the retry was
      // canceled), bringing the count to 2 — not 3.
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
      render(<Harness />);

      // Flush microtasks so the initial connect completes.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(connectCallCount).toBe(1);

      // Advance partway so the retry timer is scheduled but not fired.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      cleanup();

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

  it("does not surface an error when the cut is deliberate (aborted)", async () => {
    let connectCallCount = 0;
    fetchSpy.mockReset();
    fetchSpy.mockImplementation((url: string, init?: RequestInit) => {
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
          // Hangs until the cut aborts it when we hide.
          return Promise.resolve(
            makeHangingSseResponse(
              [{ type: "RUN_STARTED", threadId: "s", runId: "r1" }],
              init?.signal,
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

  it("falls back to loadSnapshot when cursorRef is null on reconnect", async () => {
    let snapshotCallCount = 0;
    let runStarted = false;
    fetchSpy.mockReset();
    fetchSpy.mockImplementation((url: string) => {
      if (url === "/api/agent/code/sessions/s/snapshot") {
        snapshotCallCount += 1;
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

    await act(async () => {
      fireEvent.click(screen.getByTestId("send"));
    });
    await waitFor(() => expect(runStarted).toBe(true));

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
});
