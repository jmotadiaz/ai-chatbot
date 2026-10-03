/** @vitest-environment jsdom */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  act,
  waitFor,
} from "@testing-library/react";
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

function makeHangingSseResponse(events: object[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const e of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        }
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

function Harness({
  initialSnapshot,
}: {
  initialSnapshot?: SessionSnapshot | null;
}) {
  const { sendMessage, enqueueFollowUp, pendingMessage, pendingQueues, isRunning, error } =
    useCodingAgent({
      project: "p",
      sessionId: "s",
      modelId: "m",
      initialSnapshot,
    });
  return (
    <div>
      <button data-testid="send-idle" onClick={() => void sendMessage("hello fresh turn")}>
        send idle
      </button>
      <button
        data-testid="enqueue"
        onClick={() => void enqueueFollowUp("mid-turn note").catch(() => {})}
      >
        enqueue
      </button>
      <p data-testid="is-running">{String(isRunning)}</p>
      <p data-testid="pending">{pendingMessage ?? ""}</p>
      <p data-testid="pending-steering">{pendingQueues.steering.join("|")}</p>
      <p data-testid="pending-follow-up">{pendingQueues.followUp.join("|")}</p>
      <p data-testid="error">{error ?? ""}</p>
    </div>
  );
}

const snapshotUrl = "*/api/agent/code/sessions/s/snapshot";
const runUrl = "*/api/agent/code";
const followUpUrl = "*/api/agent/code/follow-up";
const connectUrl = "*/api/agent/code/connect";
const traceUrl = "*/api/agent/code/trace";

let currentSnapshot: Record<string, unknown> = {
  messages: [],
  cursor: null,
  running: false,
};
let snapshotCallCount = 0;
let runRequests: Array<Record<string, unknown>> = [];
let connectBodies: Array<Record<string, unknown>> = [];

const server = setupMswServer(
  http.get(snapshotUrl, () => {
    snapshotCallCount += 1;
    return HttpResponse.json(currentSnapshot);
  }),
  http.post(runUrl, async ({ request }) => {
    runRequests.push((await request.json()) as Record<string, unknown>);
    return makeHangingSseResponse([
      { type: "RUN_STARTED", threadId: "s", runId: "r-hang" },
    ]);
  }),
  http.post(followUpUrl, () => {
    return HttpResponse.json({
      queued: true,
      pending: { steering: [], followUp: ["mid-turn note"] },
    });
  }),
  http.post(connectUrl, async ({ request }) => {
    connectBodies.push((await request.json()) as Record<string, unknown>);
    return makeHangingSseResponse([
      { type: "RUN_STARTED", threadId: "s", runId: "r-connect" },
    ]);
  }),
  http.post(traceUrl, () => new HttpResponse(null, { status: 204 })),
);

describe("useCodingAgent rehydration and edge cases (ticket 04)", () => {
  beforeEach(() => {
    currentSnapshot = { messages: [], cursor: null, running: false };
    snapshotCallCount = 0;
    runRequests = [];
    connectBodies = [];
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("rehydrates the chip from snapshot.pending on reload", async () => {
    currentSnapshot = {
      messages: [],
      cursor: { epoch: "epoch-1", seq: 7 },
      running: true,
      pending: { steering: [], followUp: ["queued before reload"] },
    };
    render(<Harness />);

    // The chip appears from the snapshot alone — no queue-update event
    // has arrived over the stream yet.
    await waitFor(() =>
      expect(screen.getByTestId("pending").textContent).toBe(
        "queued before reload",
      ),
    );
    // The raw queues are the stored value; the chip text is derived from them.
    expect(screen.getByTestId("pending-steering").textContent).toBe("");
    expect(screen.getByTestId("pending-follow-up").textContent).toBe(
      "queued before reload",
    );
    expect(screen.getByTestId("is-running").textContent).toBe("true");
    // And the running session still resumes from the seeded cursor.
    await waitFor(() => expect(connectBodies.length).toBeGreaterThan(0));
    expect(connectBodies[0]!.forwardedProps).toEqual({
      afterSeq: 7,
      epoch: "epoch-1",
    });
  });

  it("seeds the chip from the SSR snapshot without fetching", async () => {
    render(
      <Harness
        initialSnapshot={{
          messages: [],
          cursor: { epoch: "epoch-1", seq: 3 },
          running: true,
          pending: { steering: [], followUp: ["seeded pending"] },
        }}
      />,
    );

    expect(screen.getByTestId("pending").textContent).toBe("seeded pending");
    expect(screen.getByTestId("pending-follow-up").textContent).toBe(
      "seeded pending",
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(snapshotCallCount).toBe(0);
  });

  it("restores no chip when the snapshot carries no pending queues", async () => {
    currentSnapshot = {
      messages: [],
      cursor: { epoch: "epoch-1", seq: 7 },
      running: true,
      pending: { steering: [], followUp: [] },
    };
    render(<Harness />);

    await waitFor(() => expect(connectBodies.length).toBeGreaterThan(0));
    expect(screen.getByTestId("pending").textContent).toBe("");
    expect(screen.getByTestId("pending-steering").textContent).toBe("");
    expect(screen.getByTestId("pending-follow-up").textContent).toBe("");
  });

  it("a failed turn with a chip leaves a defined state with no phantom runs", async () => {
    server.use(
      http.post(runUrl, async ({ request }) => {
        runRequests.push((await request.json()) as Record<string, unknown>);
        return makeSseResponse([
          { type: "RUN_STARTED", threadId: "s", runId: "r-fail" },
          {
            type: "CUSTOM",
            runId: "r-fail",
            name: "coding_agent_queue_update",
            value: { steering: [], followUp: ["armed instruction"] },
          },
          {
            type: "RUN_ERROR",
            threadId: "s",
            runId: "r-fail",
            message: "boom",
          },
        ]);
      }),
    );
    render(<Harness />);
    await waitFor(() => expect(snapshotCallCount).toBe(1));

    await act(async () => {
      fireEvent.click(screen.getByTestId("send-idle"));
    });

    // Defined and visible: the failure shows in the banner, the spinner
    // stops, and the chip still reflects the armed queue entry.
    await waitFor(() =>
      expect(screen.getByTestId("error").textContent).toBe("boom"),
    );
    expect(screen.getByTestId("is-running").textContent).toBe("false");
    expect(screen.getByTestId("pending").textContent).toBe(
      "armed instruction",
    );
    // No phantom executions: exactly one run opened, no reconnect storm.
    expect(runRequests).toHaveLength(1);
    expect(connectBodies).toHaveLength(0);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(runRequests).toHaveLength(1);
    expect(connectBodies).toHaveLength(0);
  });

  it("enqueueing with the worker down surfaces a clear error", async () => {
    server.use(http.post(followUpUrl, () => HttpResponse.error()));
    render(<Harness />);
    await waitFor(() => expect(snapshotCallCount).toBe(1));

    await act(async () => {
      fireEvent.click(screen.getByTestId("send-idle"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("is-running").textContent).toBe("true"),
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("enqueue"));
    });

    // Clear error naming the dead worker; the chip stays down and the run
    // itself is untouched (still running, still exactly one run).
    await waitFor(() =>
      expect(screen.getByTestId("error").textContent).toMatch(
        /worker unreachable/i,
      ),
    );
    expect(screen.getByTestId("pending").textContent).toBe("");
    expect(screen.getByTestId("is-running").textContent).toBe("true");
    expect(runRequests).toHaveLength(1);
  });
});

describe("useCodingAgent steering-aware chip (review fix 07) and precise queue errors (US8/US18)", () => {
  beforeEach(() => {
    currentSnapshot = { messages: [], cursor: null, running: false };
    snapshotCallCount = 0;
    runRequests = [];
    connectBodies = [];
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("a steering-only queue-update arms the chip with the steering text", async () => {
    server.use(
      http.post(runUrl, async ({ request }) => {
        runRequests.push((await request.json()) as Record<string, unknown>);
        return makeHangingSseResponse([
          { type: "RUN_STARTED", threadId: "s", runId: "r-steer" },
          {
            type: "CUSTOM",
            runId: "r-steer",
            name: "coding_agent_queue_update",
            value: { steering: ["steered text"], followUp: [] },
          },
        ]);
      }),
    );
    render(<Harness />);
    await waitFor(() => expect(snapshotCallCount).toBe(1));

    await act(async () => {
      fireEvent.click(screen.getByTestId("send-idle"));
    });

    // The promoted message keeps the chip visible (and the composer locked)
    // instead of disappearing and admitting a second message.
    await waitFor(() =>
      expect(screen.getByTestId("pending").textContent).toBe("steered text"),
    );
    // Stored raw: the steering entry survives in the queues the future
    // steering bubble will render from.
    expect(screen.getByTestId("pending-steering").textContent).toBe(
      "steered text",
    );
    expect(screen.getByTestId("pending-follow-up").textContent).toBe("");
    expect(screen.getByTestId("is-running").textContent).toBe("true");
  });

  it("with both queues armed the chip shows the follow-up text", async () => {
    server.use(
      http.post(runUrl, async ({ request }) => {
        runRequests.push((await request.json()) as Record<string, unknown>);
        return makeHangingSseResponse([
          { type: "RUN_STARTED", threadId: "s", runId: "r-both" },
          {
            type: "CUSTOM",
            runId: "r-both",
            name: "coding_agent_queue_update",
            value: { steering: ["steered text"], followUp: ["queued text"] },
          },
        ]);
      }),
    );
    render(<Harness />);
    await waitFor(() => expect(snapshotCallCount).toBe(1));

    await act(async () => {
      fireEvent.click(screen.getByTestId("send-idle"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("pending").textContent).toBe("queued text"),
    );
    // Both queues survive the event verbatim; only the chip picks the
    // follow-up entry.
    expect(screen.getByTestId("pending-steering").textContent).toBe(
      "steered text",
    );
    expect(screen.getByTestId("pending-follow-up").textContent).toBe(
      "queued text",
    );
  });

  it("rehydrates the chip from a steering-only snapshot on reload", async () => {
    currentSnapshot = {
      messages: [],
      cursor: { epoch: "epoch-1", seq: 7 },
      running: true,
      pending: { steering: ["steered before reload"], followUp: [] },
    };
    render(<Harness />);

    await waitFor(() =>
      expect(screen.getByTestId("pending").textContent).toBe(
        "steered before reload",
      ),
    );
    expect(screen.getByTestId("pending-steering").textContent).toBe(
      "steered before reload",
    );
    expect(screen.getByTestId("is-running").textContent).toBe("true");
  });

  it("surfaces the worker's precise rejection verbatim instead of a generic status", async () => {
    server.use(
      http.post(followUpUrl, () => {
        return new HttpResponse(
          "Skills cannot be queued as a follow-up (plain text only)",
          { status: 400 },
        );
      }),
    );
    render(<Harness />);
    await waitFor(() => expect(snapshotCallCount).toBe(1));

    await act(async () => {
      fireEvent.click(screen.getByTestId("enqueue"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("error").textContent).toBe(
        "Skills cannot be queued as a follow-up (plain text only)",
      ),
    );
    expect(screen.getByTestId("pending").textContent).toBe("");
  });

  it("surfaces the single-pending conflict verbatim", async () => {
    server.use(
      http.post(followUpUrl, () => {
        return new HttpResponse(
          "A message is already pending: discard, edit or promote it before queueing another",
          { status: 409 },
        );
      }),
    );
    render(<Harness />);
    await waitFor(() => expect(snapshotCallCount).toBe(1));

    await act(async () => {
      fireEvent.click(screen.getByTestId("enqueue"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("error").textContent).toMatch(
        /already pending/,
      ),
    );
    expect(screen.getByTestId("pending").textContent).toBe("");
  });
});
