/** @vitest-environment jsdom */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, act, waitFor } from "@testing-library/react";
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

const HISTORY = [
  { id: "u1", role: "user", content: "first question" },
  { id: "a1", role: "assistant", content: "answer one" },
  { id: "u2", role: "user", content: "second question" },
  { id: "a2", role: "assistant", content: "answer two" },
];

const snapshotUrl = "*/api/agent/code/sessions/s/snapshot";
const runUrl = "*/api/agent/code";

let runRequests: Array<Record<string, unknown>> = [];
let snapshotCalls = 0;
let runFails = false;

setupMswServer(
  http.get(snapshotUrl, () => {
    snapshotCalls += 1;
    return HttpResponse.json({ messages: HISTORY, cursor: null, running: false });
  }),
  http.post(runUrl, async ({ request }) => {
    runRequests.push((await request.json()) as Record<string, unknown>);
    if (runFails) return new HttpResponse(null, { status: 500 });
    return makeSseResponse([
      { type: "RUN_STARTED", threadId: "s", runId: "r" },
      { type: "RUN_FINISHED", threadId: "s", runId: "r" },
    ]);
  }),
  http.post("*/api/agent/code/trace", () => new HttpResponse(null, { status: 204 })),
);

function Harness() {
  const { messages, sendMessage } = useCodingAgent({
    project: "p",
    sessionId: "s",
    modelId: "m",
  });
  return (
    <div>
      <button
        data-testid="edit"
        onClick={() =>
          void sendMessage("edited second question", { branchFromMessageId: "u2" })
        }
      >
        edit
      </button>
      {messages.map((m) => (
        <p key={m.id} data-testid="message">
          {`${m.id}:${String(m.content)}`}
        </p>
      ))}
    </div>
  );
}

beforeEach(() => {
  runRequests = [];
  snapshotCalls = 0;
  runFails = false;
  window.localStorage.clear();
});

afterEach(cleanup);

describe("useCodingAgent Message Edit", () => {
  it("truncates the transcript optimistically and sends the branch alongside the run", async () => {
    render(<Harness />);
    await waitFor(() => expect(snapshotCalls).toBe(1));
    await waitFor(() => expect(screen.getAllByTestId("message")).toHaveLength(4));

    await act(async () => {
      screen.getByTestId("edit").click();
    });

    // The abandoned branch is gone in the same frame as the submit, and the
    // edited Message keeps its id.
    await waitFor(() => {
      const rendered = screen.getAllByTestId("message").map((node) => node.textContent);
      expect(rendered).toEqual([
        "u1:first question",
        "a1:answer one",
        "u2:edited second question",
      ]);
    });

    // The worker is told which Message the Turn rewinds to, and the request
    // carries the already-truncated list.
    expect(runRequests).toHaveLength(1);
    const body = runRequests[0]!;
    expect(body.forwardedProps).toEqual({ branchFromMessageId: "u2" });
    const sent = (body.messages as Array<{ id: string; content: unknown }>).map(
      (message) => message.id,
    );
    expect(sent).toEqual(["u1", "a1", "u2"]);
  });

  it("drops the changed-files blocks anchored to the abandoned Turns", async () => {
    window.localStorage.setItem(
      "coding-agent:turn-files:s",
      JSON.stringify([
        { messageId: "a1", files: [{ path: "src/a.ts", status: "modified" }] },
        { messageId: "a2", files: [{ path: "src/b.ts", status: "modified" }] },
      ]),
    );
    render(<Harness />);
    await waitFor(() => expect(snapshotCalls).toBe(1));

    await act(async () => {
      screen.getByTestId("edit").click();
    });

    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem("coding-agent:turn-files:s") ?? "[]",
      ) as Array<{ messageId: string }>;
      expect(stored.map((entry) => entry.messageId)).toEqual(["a1"]);
    });
  });

  it("puts the transcript back when the run never reaches the worker", async () => {
    runFails = true;
    render(<Harness />);
    await waitFor(() => expect(snapshotCalls).toBe(1));
    await waitFor(() => expect(screen.getAllByTestId("message")).toHaveLength(4));

    await act(async () => {
      screen.getByTestId("edit").click();
    });

    await waitFor(() => expect(runRequests).toHaveLength(1));
    await waitFor(() => {
      expect(screen.getAllByTestId("message").map((node) => node.textContent)).toEqual([
        "u1:first question",
        "a1:answer one",
        "u2:second question",
        "a2:answer two",
      ]);
    });
  });
});
