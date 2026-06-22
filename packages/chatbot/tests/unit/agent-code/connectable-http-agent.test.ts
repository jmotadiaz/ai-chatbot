import { describe, it, expect, vi } from "vitest";
import { ConnectableHttpAgent } from "@/lib/features/code/connectable-http-agent";

function sseResponse(lines: string[]): Response {
  const body = lines.map((l) => `data: ${l}\n\n`).join("");
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("ConnectableHttpAgent", () => {
  it("POSTs to runUrl on run()", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse([
        JSON.stringify({
          type: "RUN_FINISHED",
          threadId: "t1",
          runId: "r1",
        }),
      ]),
    );
    const agent = new ConnectableHttpAgent({
      runUrl: "/api/run",
      connectUrl: "/api/connect",
      threadId: "t1",
      fetch: fetchImpl,
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

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("/api/run");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.threadId).toBe("t1");
    expect(body.runId).toBe("r1");
  });

  it("POSTs to connectUrl on connect()", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse([
        JSON.stringify({
          type: "RUN_FINISHED",
          threadId: "t2",
          runId: "r2",
        }),
      ]),
    );
    const agent = new ConnectableHttpAgent({
      runUrl: "/api/run",
      connectUrl: "/api/connect",
      threadId: "t2",
      fetch: fetchImpl,
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

    const [url] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("/api/connect");
  });
});
