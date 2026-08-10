import { describe, it, expect, vi, beforeEach } from "vitest";
import { http } from "msw";
import { setupMswServer } from "../../helpers/msw-server";
import { ConnectableHttpAgent } from "@/lib/features/code/connectable-http-agent";

function sseResponse(lines: string[]): Response {
  const body = lines.map((l) => `data: ${l}\n\n`).join("");
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

const runUrl = "http://agent.test/api/run";
const connectUrl = "http://agent.test/api/connect";
let runBody: Record<string, unknown> | undefined;
let runSignal: AbortSignal | undefined;
let connectCount = 0;

const server = setupMswServer(
  http.post(runUrl, async ({ request }) => {
    runBody = (await request.json()) as Record<string, unknown>;
    runSignal = request.signal;
    return sseResponse([
      JSON.stringify({ type: "RUN_FINISHED", threadId: "t1", runId: "r1" }),
    ]);
  }),
  http.post(connectUrl, () => {
    connectCount += 1;
    return sseResponse([
      JSON.stringify({ type: "RUN_FINISHED", threadId: "t2", runId: "r2" }),
    ]);
  }),
);

describe("ConnectableHttpAgent", () => {
  beforeEach(() => {
    runBody = undefined;
    runSignal = undefined;
    connectCount = 0;
  });

  it("POSTs to runUrl on run()", async () => {
    const agent = new ConnectableHttpAgent({
      runUrl,
      connectUrl,
      threadId: "t1",
    });

    await new Promise<void>((resolve, reject) => {
      agent
        .run({
          threadId: "t1",
          runId: "r1",
          tools: [],
          context: [],
          forwardedProps: {},
          state: {},
          messages: [],
        })
        .subscribe({ next: () => {}, error: reject, complete: () => resolve() });
    });

    expect(runBody?.threadId).toBe("t1");
    expect(runBody?.runId).toBe("r1");
  });

  it("POSTs to connectUrl on connect()", async () => {
    const agent = new ConnectableHttpAgent({
      runUrl,
      connectUrl,
      threadId: "t2",
    });

    await new Promise<void>((resolve, reject) => {
      agent
        .connect({
          threadId: "t2",
          runId: "r2",
          tools: [],
          context: [],
          forwardedProps: {},
          state: {},
          messages: [],
        })
        .subscribe({ next: () => {}, error: reject, complete: () => resolve() });
    });

    expect(connectCount).toBe(1);
  });

  it("aborts the in-flight fetch's signal when abortRun() is called", async () => {
    server.use(
      http.post(runUrl, ({ request }) => {
        runSignal = request.signal;
        return new Promise<Response>(() => {});
      }),
    );
    const agent = new ConnectableHttpAgent({
      runUrl,
      connectUrl,
      threadId: "t",
    });

    agent
      .run({
        threadId: "t",
        runId: "r",
        tools: [],
        context: [],
        forwardedProps: {},
        state: {},
        messages: [],
      })
      .subscribe({ next: () => {}, error: () => {}, complete: () => {} });

    await vi.waitFor(() => expect(runSignal).toBeDefined());
    agent.abortRun();
    expect(runSignal!.aborted).toBe(true);
  });

  it("resets the AbortController so a subsequent run() is not aborted", async () => {
    server.use(
      http.post(runUrl, ({ request }) => {
        runSignal = request.signal;
        return sseResponse([
          JSON.stringify({ type: "RUN_FINISHED", threadId: "t", runId: "r2" }),
        ]);
      }),
    );
    const agent = new ConnectableHttpAgent({
      runUrl,
      connectUrl,
      threadId: "t",
    });

    agent.abortRun(); // would leave a stale aborted controller on the old impl

    await new Promise<void>((resolve, reject) => {
      agent
        .run({
          threadId: "t",
          runId: "r2",
          tools: [],
          context: [],
          forwardedProps: {},
          state: {},
          messages: [],
        })
        .subscribe({ next: () => {}, error: reject, complete: () => resolve() });
    });

    // The second run happened on a fresh controller — sign unborn.
    expect(runSignal?.aborted).toBe(false);
  });
});
