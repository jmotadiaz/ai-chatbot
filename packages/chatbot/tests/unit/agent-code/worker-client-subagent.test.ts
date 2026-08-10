import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupMswServer } from "../../helpers/msw-server";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  acquireTraceSink: async () => null,
  releaseTraceSink: async () => {},
  retainTraceSink: () => async () => {},
  getTraceLogger: () => ({
    info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
    startTimer: () => () => {},
  }),
}));

const { WorkerClient } = await import("@/lib/features/code/worker-client");

const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
setupMswServer(
  http.post("http://worker.test/rpc", async ({ request }) => {
    const rpc = (await request.json()) as {
      id: number;
      method: string;
      params: Record<string, unknown>;
    };
    requests.push(rpc);
    const result = rpc.method === "getSubagentSession"
      ? { subSessionId: "child-1", subPiSessionId: "pi-child-1" }
      : { messages: [], cursor: null, running: false };
    return HttpResponse.json({ jsonrpc: "2.0", id: rpc.id, result });
  }),
);

describe("WorkerClient.getSubagentSession", () => {
  beforeEach(() => {
    requests.length = 0;
  });

  it("calls the getSubagentSession RPC method", async () => {
    const client = new WorkerClient("http://worker.test");
    const r = await client.getSubagentSession({ parentSessionId: "p", toolCallId: "tc-1" });
    expect(r).toEqual({ subSessionId: "child-1", subPiSessionId: "pi-child-1" });
    expect(requests[0]).toEqual(expect.objectContaining({
      method: "getSubagentSession",
      params: { parentSessionId: "p", toolCallId: "tc-1" },
    }));
  });

  it("forwards parentSessionId on getSessionSnapshot", async () => {
    const client = new WorkerClient("http://worker.test");
    await client.getSessionSnapshot({ sessionId: "child-1", parentSessionId: "p" });
    expect(requests[0]?.params).toMatchObject({
      sessionId: "child-1",
      parentSessionId: "p",
    });
  });
});
