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
  const { messages, sendMessage } = useCodingAgent({
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
});
