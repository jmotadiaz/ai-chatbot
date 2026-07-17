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

  it("surfaces a genuine connection failure as an error instead of retrying silently in the background", async () => {
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
        // The fetch itself rejects, as it does on a genuine dropped
        // connection (Safari's "TypeError: network error").
        return Promise.reject(new TypeError("network error"));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });

    render(<Harness />);

    await waitFor(() => expect(connectCallCount).toBe(1));
    // No background retry loop anymore — the failure must show up right away
    // so the user knows to bring the tab back into focus (or reload) instead
    // of staring at a spinner that will never resolve on its own.
    await waitFor(() => expect(screen.getByTestId("error").textContent).toBe("network error"));
    expect(connectCallCount).toBe(1);
  });

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
});
