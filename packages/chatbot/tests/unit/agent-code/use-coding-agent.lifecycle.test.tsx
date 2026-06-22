// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  act,
} from "@testing-library/react";
import { useState } from "react";
import type { Message } from "@ag-ui/client";
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

function Harness({ initialMessages }: { initialMessages: Message[] }) {
  const [, setTick] = useState(0);
  const { messages, sendMessage } = useCodingAgent({
    project: "p",
    sessionId: "s",
    modelId: "m",
    initialMessages,
    isInitiallyRunning: false,
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
    fetchSpy = vi.fn().mockResolvedValue(
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
    render(<Harness initialMessages={[]} />);

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
});
