/** @vitest-environment jsdom */
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
import { http, HttpResponse } from "msw";
import { setupMswServer } from "../../helpers/msw-server";
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

const snapshotUrl = "*/api/agent/code/sessions/s/snapshot";
const runUrl = "*/api/agent/code";
const connectUrl = "*/api/agent/code/connect";
const traceUrl = "*/api/agent/code/trace";

interface CapturedRequest {
  body: Record<string, unknown>;
  signal: AbortSignal;
}

let snapshotCallCount = 0;
let runRequests: CapturedRequest[] = [];
let connectRequests: CapturedRequest[] = [];

const server = setupMswServer(
  http.get(snapshotUrl, () => {
    snapshotCallCount += 1;
    return HttpResponse.json({ messages: [], cursor: null, running: false });
  }),
  http.post(runUrl, async ({ request }) => {
    runRequests.push({
      body: (await request.json()) as Record<string, unknown>,
      signal: request.signal,
    });
    return makeSseResponse([
      { type: "RUN_STARTED", threadId: "s", runId: "r" },
      { type: "RUN_FINISHED", threadId: "s", runId: "r" },
    ]);
  }),
  http.post(connectUrl, async ({ request }) => {
    connectRequests.push({
      body: (await request.json()) as Record<string, unknown>,
      signal: request.signal,
    });
    return makeSseResponse([
      { type: "RUN_STARTED", threadId: "s", runId: "connect-r" },
      { type: "RUN_FINISHED", threadId: "s", runId: "connect-r" },
    ]);
  }),
  http.post(traceUrl, () => new HttpResponse(null, { status: 204 })),
);

function ThinkingLevelHarness({ level }: { level: "low" | null }) {
  const { sendMessage } = useCodingAgent({
    project: "p",
    sessionId: "s",
    modelId: "m",
    thinkingLevel: level,
  });
  return (
    <button data-testid="send" onClick={() => void sendMessage("hello")}>
      send
    </button>
  );
}

function AttachmentHarness() {
  const { sendMessage } = useCodingAgent({ project: "p", sessionId: "s", modelId: "m" });
  return (
    <button data-testid="send-attachment" onClick={() => void sendMessage(ATTACHMENT_CONTENT)}>
      send
    </button>
  );
}

describe("useCodingAgent client lifecycle", () => {
  beforeEach(() => {
    snapshotCallCount = 0;
    runRequests = [];
    connectRequests = [];
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows the user message after send, even when a re-render happens before send (no dual-agent drift)", async () => {
    render(<Harness />);
    await waitFor(() => expect(snapshotCallCount).toBe(1));

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
    await waitFor(() => expect(snapshotCallCount).toBe(1));

    await act(async () => {
      fireEvent.click(screen.getByTestId("send-attachment"));
    });

    await waitFor(() => expect(runRequests).toHaveLength(1));
    const body = runRequests[0]!.body;
    const messages = body.messages as Array<{ role: string; content: unknown }>;
    const lastUserMessage = messages[messages.length - 1];
    expect(lastUserMessage.role).toBe("user");
    expect(lastUserMessage.content).toEqual(ATTACHMENT_CONTENT);
  });

  it("sends the reasoning level with the prompt, like the model", async () => {
    render(<ThinkingLevelHarness level="low" />);
    await waitFor(() => expect(snapshotCallCount).toBe(1));

    await act(async () => {
      fireEvent.click(screen.getByTestId("send"));
    });

    await waitFor(() => expect(runRequests).toHaveLength(1));
    const body = runRequests[0]!.body;
    expect(body.context).toContainEqual({
      description: "thinkingLevel",
      value: "low",
    });
  });

  it("omits the reasoning level while it is not resolved yet", async () => {
    render(<ThinkingLevelHarness level={null} />);
    await waitFor(() => expect(snapshotCallCount).toBe(1));

    await act(async () => {
      fireEvent.click(screen.getByTestId("send"));
    });

    await waitFor(() => expect(runRequests).toHaveLength(1));
    const body = runRequests[0]!.body;
    expect(
      (body.context as Array<{ description: string }>).map((c) => c.description),
    ).not.toContain("thinkingLevel");
  });

  it("connects an active session from the cursor returned by the worker snapshot", async () => {
    server.use(
      http.get(snapshotUrl, () => {
        snapshotCallCount += 1;
        return HttpResponse.json({
          messages: [],
          cursor: { epoch: "worker-epoch", seq: 12 },
          running: true,
        });
      }),
    );

    render(<Harness />);

    await waitFor(() => expect(connectRequests).toHaveLength(1));
    expect(connectRequests[0]!.body).toEqual(
      expect.objectContaining({
        forwardedProps: { afterSeq: 12, epoch: "worker-epoch" },
      }),
    );
  });

  it("does not reconnect on visibilitychange when idle", async () => {
    render(<Harness />);
    await waitFor(() => expect(snapshotCallCount).toBe(1));

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    fireEvent(document, new Event("visibilitychange"));

    // Nothing to resume (shouldReconnectRef is false), so no fetch should fire.
    await new Promise((r) => setTimeout(r, 20));
    expect(snapshotCallCount).toBe(1);
    expect(runRequests).toHaveLength(0);
    expect(connectRequests).toHaveLength(0);
  });

  it("cuts the stream when hidden and reconnects when shown again", async () => {
    server.use(
      http.get(snapshotUrl, () => {
        snapshotCallCount += 1;
        return HttpResponse.json({
          messages: [],
          cursor: { epoch: "e", seq: 5 },
          running: true,
        });
      }),
      http.post(connectUrl, async ({ request }) => {
        connectRequests.push({
          body: (await request.json()) as Record<string, unknown>,
          signal: request.signal,
        });
        if (connectRequests.length === 1) {
          // The initial connect hangs until the cut aborts it — simulates a
          // stream that the user navigates away from while it is flowing.
          return makeHangingSseResponse(
            [{ type: "RUN_STARTED", threadId: "s", runId: "r1" }],
            request.signal,
          );
        }
        return makeSseResponse([
          { type: "RUN_STARTED", threadId: "s", runId: "r2" },
          { type: "RUN_FINISHED", threadId: "s", runId: "r2" },
        ]);
      }),
    );

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });

    render(<Harness />);
    await waitFor(() => expect(connectRequests).toHaveLength(1));

    // Hide the tab — the in-flight fetch must be aborted.
    const firstSignal = connectRequests[0]!.signal;

    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    await act(async () => {
      fireEvent(document, new Event("visibilitychange"));
    });
    expect(firstSignal.aborted).toBe(true);
    expect(connectRequests).toHaveLength(1); // no reconnect while hidden
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

    await waitFor(() => expect(connectRequests).toHaveLength(2));

    expect(connectRequests[1]!.body).toEqual(
      expect.objectContaining({
        forwardedProps: { afterSeq: 5, epoch: "e" },
      }),
    );
  });

  it("online fires while hidden does not reconnect", async () => {
    server.use(
      http.get(snapshotUrl, () => {
        snapshotCallCount += 1;
        return HttpResponse.json({
          messages: [],
          cursor: { epoch: "e", seq: 5 },
          running: true,
        });
      }),
      http.post(connectUrl, async ({ request }) => {
        connectRequests.push({
          body: (await request.json()) as Record<string, unknown>,
          signal: request.signal,
        });
        // Never terminates — a second call only happens if something wrongly
        // reconnects while the tab is hidden.
        return makeSseResponse([
          {
            type: "RUN_STARTED",
            threadId: "s",
            runId: `r${connectRequests.length}`,
          },
        ]);
      }),
    );

    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
      writable: true,
    });

    render(<Harness />);
    await waitFor(() => expect(connectRequests).toHaveLength(1));

    // "online" firing while backgrounded (e.g. wifi reconnecting behind the
    // app) must not trigger a reconnect either.
    fireEvent(window, new Event("online"));

    await new Promise((r) => setTimeout(r, 50));
    expect(connectRequests).toHaveLength(1);
  });

  it("retries connect with exponential backoff then surfaces error after 4 attempts (3 retries)", async () => {
    server.use(
      http.get(snapshotUrl, () => {
        snapshotCallCount += 1;
        return HttpResponse.json({
          messages: [],
          cursor: { epoch: "e", seq: 5 },
          running: true,
        });
      }),
      http.post(connectUrl, async ({ request }) => {
        connectRequests.push({
          body: (await request.json()) as Record<string, unknown>,
          signal: request.signal,
        });
        return HttpResponse.error();
      }),
    );

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
      expect(connectRequests).toHaveLength(1);

      // Retry 1 at +300ms
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(connectRequests).toHaveLength(2);

      // Retry 2 at +600ms
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });
      expect(connectRequests).toHaveLength(3);

      // Retry 3 at +1200ms — exhausted, error surfaces
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1200);
      });
      expect(connectRequests).toHaveLength(4);

      expect(screen.getByTestId("error").textContent).toBe("Failed to fetch");
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a pending retry when ensureConnected fires (race resolver)", async () => {
    server.use(
      http.get(snapshotUrl, () => {
        snapshotCallCount += 1;
        return HttpResponse.json({
          messages: [],
          cursor: { epoch: "e", seq: 5 },
          running: true,
        });
      }),
      http.post(connectUrl, async ({ request }) => {
        connectRequests.push({
          body: (await request.json()) as Record<string, unknown>,
          signal: request.signal,
        });
        // First connect attempt fails (will schedule retry). Second attempt
        // succeeds so that the ensureConnected-triggered connect does not add
        // its own retry to the count — this isolates the "cancel pending
        // retry" behavior being tested.
        if (connectRequests.length === 1) {
          return HttpResponse.error();
        }
        return makeSseResponse([
          { type: "RUN_STARTED", threadId: "s", runId: "r2" },
          { type: "RUN_FINISHED", threadId: "s", runId: "r2" },
        ]);
      }),
    );

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
      expect(connectRequests).toHaveLength(1);

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
      expect(connectRequests).toHaveLength(2);

      // Advance past the original 300ms retry deadline to prove the timer
      // was really canceled — no extra connection.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(connectRequests).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a pending retry timer on unmount", async () => {
    server.use(
      http.get(snapshotUrl, () => {
        snapshotCallCount += 1;
        return HttpResponse.json({
          messages: [],
          cursor: { epoch: "e", seq: 5 },
          running: true,
        });
      }),
      http.post(connectUrl, async ({ request }) => {
        connectRequests.push({
          body: (await request.json()) as Record<string, unknown>,
          signal: request.signal,
        });
        return HttpResponse.error();
      }),
    );

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
      expect(connectRequests).toHaveLength(1);

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
      expect(connectRequests).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not surface an error when the cut is deliberate (aborted)", async () => {
    server.use(
      http.get(snapshotUrl, () => {
        snapshotCallCount += 1;
        return HttpResponse.json({
          messages: [],
          cursor: { epoch: "e", seq: 5 },
          running: true,
        });
      }),
      http.post(connectUrl, async ({ request }) => {
        connectRequests.push({
          body: (await request.json()) as Record<string, unknown>,
          signal: request.signal,
        });
        if (connectRequests.length === 1) {
          // Hangs until the cut aborts it when we hide.
          return makeHangingSseResponse(
            [{ type: "RUN_STARTED", threadId: "s", runId: "r1" }],
            request.signal,
          );
        }
        return makeSseResponse([
          { type: "RUN_STARTED", threadId: "s", runId: "r2" },
          { type: "RUN_FINISHED", threadId: "s", runId: "r2" },
        ]);
      }),
    );

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });

    render(<Harness />);
    await waitFor(() => expect(connectRequests).toHaveLength(1));

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

    await waitFor(() => expect(connectRequests).toHaveLength(2));
    expect(screen.getByTestId("error").textContent).toBe("");
  });

  it("reconnects on pageshow (iOS bfcache restore)", async () => {
    server.use(
      http.get(snapshotUrl, () => {
        snapshotCallCount += 1;
        return HttpResponse.json({
          messages: [],
          cursor: { epoch: "e", seq: 5 },
          running: true,
        });
      }),
      http.post(connectUrl, async ({ request }) => {
        connectRequests.push({
          body: (await request.json()) as Record<string, unknown>,
          signal: request.signal,
        });
        if (connectRequests.length === 1) {
          return makeHangingSseResponse(
            [{ type: "RUN_STARTED", threadId: "s", runId: "r1" }],
            request.signal,
          );
        }
        return makeSseResponse([
          { type: "RUN_STARTED", threadId: "s", runId: "r2" },
          { type: "RUN_FINISHED", threadId: "s", runId: "r2" },
        ]);
      }),
    );

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });

    render(<Harness />);
    await waitFor(() => expect(connectRequests).toHaveLength(1));

    await act(async () => {
      fireEvent(window, new Event("pageshow"));
    });

    await waitFor(() => expect(connectRequests).toHaveLength(2));
  });

  it("falls back to loadSnapshot when cursorRef is null on reconnect", async () => {
    let runStarted = false;
    server.use(
      http.get(snapshotUrl, () => {
        snapshotCallCount += 1;
        const running = snapshotCallCount === 2;
        return HttpResponse.json({
          messages: [],
          cursor: running ? { epoch: "e", seq: 9 } : null,
          running,
        });
      }),
      http.post(runUrl, ({ request }) => {
        runStarted = true;
        return makeHangingSseResponse(
          [{ type: "RUN_STARTED", threadId: "s", runId: "r-send" }],
          request.signal,
        );
      }),
    );

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

    await waitFor(() => expect(connectRequests).toHaveLength(1));
    expect(connectRequests[0]!.body).toEqual(
      expect.objectContaining({
        forwardedProps: { afterSeq: 9, epoch: "e" },
      }),
    );
  });
});
