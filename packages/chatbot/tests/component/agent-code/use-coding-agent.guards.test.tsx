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
import { useState } from "react";
import type { InputContent } from "@ag-ui/client";
import { http, HttpResponse } from "msw";
import { setupMswServer } from "../../helpers/msw-server";
import { useCodingAgent } from "@/lib/features/code/hooks/use-coding-agent";

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

const ATTACHMENT_CONTENT: InputContent[] = [
  { type: "text", text: "look at this" },
  {
    type: "image",
    source: { type: "data", value: "aW1hZ2U=", mimeType: "image/png" },
    metadata: { filename: "cat.png" },
  },
];

function GuardsHarness() {
  const { sendMessage, cancel, error, isRunning, pendingMessage } =
    useCodingAgent({ project: "p", sessionId: "s", modelId: "m" });
  const [cancelDraft, setCancelDraft] = useState<string | null | undefined>(
    undefined,
  );
  return (
    <div>
      <button data-testid="send-idle" onClick={() => void sendMessage("hello fresh turn")}>
        send idle
      </button>
      <button data-testid="send-mid" onClick={() => void sendMessage("steer a bit")}>
        send mid
      </button>
      <button
        data-testid="send-attachment"
        onClick={() => void sendMessage(ATTACHMENT_CONTENT)}
      >
        send attachment
      </button>
      <button data-testid="cancel" onClick={() => void cancel().then(setCancelDraft)}>
        cancel
      </button>
      <p data-testid="error">{error ?? ""}</p>
      <p data-testid="is-running">{String(isRunning)}</p>
      <p data-testid="pending">{pendingMessage ?? ""}</p>
      <p data-testid="cancel-draft">
        {cancelDraft === undefined ? "unset" : (cancelDraft ?? "null")}
      </p>
    </div>
  );
}

const snapshotUrl = "*/api/agent/code/sessions/s/snapshot";
const runUrl = "*/api/agent/code";
const followUpUrl = "*/api/agent/code/follow-up";
const cancelUrl = "*/api/agent/code/cancel";
const traceUrl = "*/api/agent/code/trace";

let snapshotCallCount = 0;
let runRequests: Array<Record<string, unknown>> = [];
let followUpRequests: Array<Record<string, unknown>> = [];
let cancelRequests: Array<Record<string, unknown>> = [];

setupMswServer(
  http.get(snapshotUrl, () => {
    snapshotCallCount += 1;
    return HttpResponse.json({ messages: [], cursor: null, running: false });
  }),
  http.post(runUrl, async ({ request }) => {
    runRequests.push((await request.json()) as Record<string, unknown>);
    // A turn that never ends on its own: RUN_STARTED arms isRunning, the
    // queue-update arms the chip, and no terminal ever closes the run.
    return makeHangingSseResponse([
      { type: "RUN_STARTED", threadId: "s", runId: "r-hang" },
      {
        type: "CUSTOM",
        runId: "r-hang",
        name: "coding_agent_queue_update",
        value: { steering: [], followUp: ["draft text"] },
      },
    ]);
  }),
  http.post(followUpUrl, async ({ request }) => {
    followUpRequests.push((await request.json()) as Record<string, unknown>);
    return HttpResponse.json({
      queued: true,
      pending: { steering: [], followUp: ["steer a bit"] },
    });
  }),
  http.post(cancelUrl, async ({ request }) => {
    cancelRequests.push((await request.json()) as Record<string, unknown>);
    return HttpResponse.json({
      cancelled: true,
      cleared: { steering: [], followUp: ["draft text"] },
    });
  }),
  http.post(traceUrl, () => new HttpResponse(null, { status: 204 })),
);

async function openHangingTurn() {
  render(<GuardsHarness />);
  await waitFor(() => expect(snapshotCallCount).toBe(1));
  await act(async () => {
    fireEvent.click(screen.getByTestId("send-idle"));
  });
  await waitFor(() => expect(screen.getByTestId("is-running").textContent).toBe("true"));
}

describe("useCodingAgent submit duality (ticket 03)", () => {
  beforeEach(() => {
    snapshotCallCount = 0;
    runRequests = [];
    followUpRequests = [];
    cancelRequests = [];
  });

  afterEach(() => {
    cleanup();
  });

  it("idle send opens a new turn, never the queue", async () => {
    render(<GuardsHarness />);
    await waitFor(() => expect(snapshotCallCount).toBe(1));

    await act(async () => {
      fireEvent.click(screen.getByTestId("send-idle"));
    });

    await waitFor(() => expect(runRequests).toHaveLength(1));
    expect(followUpRequests).toHaveLength(0);
  });

  it("mid-turn send goes through follow-up, never a second run", async () => {
    await openHangingTurn();
    expect(runRequests).toHaveLength(1);

    await act(async () => {
      fireEvent.click(screen.getByTestId("send-mid"));
    });

    await waitFor(() => expect(followUpRequests).toHaveLength(1));
    expect(followUpRequests[0]).toMatchObject({ sessionId: "s", text: "steer a bit" });
    expect(runRequests).toHaveLength(1);
    expect(screen.getByTestId("error").textContent).toBe("");
  });

  it("mid-turn send with attachments surfaces a visible error and never enqueues", async () => {
    await openHangingTurn();

    await act(async () => {
      fireEvent.click(screen.getByTestId("send-attachment"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("error").textContent).toMatch(/plain text only/i),
    );
    expect(followUpRequests).toHaveLength(0);
    expect(runRequests).toHaveLength(1);
  });

  it("cancel with a pending chip resolves the drained text and clears the chip", async () => {
    await openHangingTurn();
    await waitFor(() =>
      expect(screen.getByTestId("pending").textContent).toBe("draft text"),
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("cancel"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("cancel-draft").textContent).toBe("draft text"),
    );
    expect(cancelRequests).toHaveLength(1);
    expect(screen.getByTestId("pending").textContent).toBe("");
  });
});
