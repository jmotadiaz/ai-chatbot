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

  it("reconnects on visibilitychange after the connection goes stale while a run is active", async () => {
    const nowSpy = vi.spyOn(Date, "now");
    let currentTime = 1_000_000;
    nowSpy.mockImplementation(() => currentTime);

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
        if (connectCallCount === 1) {
          // Zombie stream: RUN_STARTED arrives, then the connection hangs
          // (never closes) — simulates a page frozen mid-request.
          const encoder = new TextEncoder();
          return Promise.resolve(new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(encoder.encode(
                  `data: ${JSON.stringify({ type: "RUN_STARTED", threadId: "s", runId: "r1" })}\n\n`,
                ));
              },
            }),
            { headers: { "Content-Type": "text/event-stream" } },
          ));
        }
        return Promise.resolve(makeSseResponse([
          { type: "RUN_STARTED", threadId: "s", runId: "r2" },
          { type: "RUN_FINISHED", threadId: "s", runId: "r2" },
        ]));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });

    render(<Harness />);
    await waitFor(() => expect(connectCallCount).toBe(1));

    // Move the clock past the freshness window so visibilitychange isn't
    // treated as redundant noise on top of a still-live connection.
    currentTime += 5000;
    await act(async () => {
      fireEvent(document, new Event("visibilitychange"));
    });

    await waitFor(() => expect(connectCallCount).toBe(2));
    nowSpy.mockRestore();
  });

  it("does not reconnect on visibilitychange while the tab is backgrounded", async () => {
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
});
