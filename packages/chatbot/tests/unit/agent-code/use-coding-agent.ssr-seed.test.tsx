/** @vitest-environment jsdom */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { Message } from "@ag-ui/client";
import { http, HttpResponse } from "msw";
import { setupMswServer } from "../../helpers/msw-server";
import {
  useCodingAgent,
  type SessionSnapshot,
} from "@/lib/features/code/hooks/use-coding-agent";

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

const snapshotUrl = "*/api/agent/code/sessions/s/snapshot";
const connectUrl = "*/api/agent/code/connect";
const traceUrl = "*/api/agent/code/trace";

let snapshotCallCount = 0;
let connectBodies: Record<string, unknown>[] = [];

setupMswServer(
  http.get(snapshotUrl, () => {
    snapshotCallCount += 1;
    return HttpResponse.json({ messages: [], cursor: null, running: false });
  }),
  http.post(connectUrl, async ({ request }) => {
    connectBodies.push((await request.json()) as Record<string, unknown>);
    return makeSseResponse([
      { type: "RUN_STARTED", threadId: "s", runId: "connect-r" },
      { type: "RUN_FINISHED", threadId: "s", runId: "connect-r" },
    ]);
  }),
  http.post(traceUrl, () => new HttpResponse(null, { status: 204 })),
);

const SEEDED_MESSAGES = [
  { id: "u1", role: "user", content: "seeded prompt" } as Message,
  { id: "a1", role: "assistant", content: "seeded answer" } as Message,
];

function seed(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    messages: SEEDED_MESSAGES,
    cursor: { epoch: "epoch-1", seq: 42 },
    running: false,
    ...overrides,
  };
}

function Harness({
  initialSnapshot,
}: {
  initialSnapshot?: SessionSnapshot | null;
}) {
  const { messages, isLoading } = useCodingAgent({
    project: "p",
    sessionId: "s",
    modelId: "m",
    initialSnapshot,
  });
  return (
    <div>
      <p data-testid="is-loading">{String(isLoading)}</p>
      {messages.map((m) => (
        <p key={m.id} data-testid={`m-${m.role}`}>
          {String(m.content)}
        </p>
      ))}
    </div>
  );
}

describe("useCodingAgent seeded from the server render", () => {
  beforeEach(() => {
    snapshotCallCount = 0;
    connectBodies = [];
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the seeded conversation without fetching the snapshot", async () => {
    render(<Harness initialSnapshot={seed()} />);

    expect(screen.getByTestId("m-user").textContent).toBe("seeded prompt");
    expect(screen.getByTestId("m-assistant").textContent).toBe("seeded answer");
    expect(screen.getByTestId("is-loading").textContent).toBe("false");

    // Nothing should ever ask the BFF for what SSR already delivered.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(snapshotCallCount).toBe(0);
  });

  it("does not connect when the seeded session is not running", async () => {
    render(<Harness initialSnapshot={seed()} />);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(connectBodies).toHaveLength(0);
  });

  it("resumes straight from the seeded cursor when the session is running", async () => {
    render(<Harness initialSnapshot={seed({ running: true })} />);

    await waitFor(() => expect(connectBodies.length).toBeGreaterThan(0));
    expect(connectBodies[0]!.forwardedProps).toEqual({
      afterSeq: 42,
      epoch: "epoch-1",
    });
    expect(snapshotCallCount).toBe(0);
  });

  it("falls back to fetching the snapshot when the server render produced none", async () => {
    render(<Harness initialSnapshot={null} />);

    await waitFor(() => expect(snapshotCallCount).toBe(1));
    expect(screen.getByTestId("is-loading").textContent).toBe("false");
  });
});
