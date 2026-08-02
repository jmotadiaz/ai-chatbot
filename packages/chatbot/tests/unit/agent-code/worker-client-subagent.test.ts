import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  getTraceLogger: () => ({
    info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
    startTimer: () => () => {},
  }),
}));

const { WorkerClient } = await import("@/lib/features/code/worker-client");

describe("WorkerClient.getSubagentSession", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("calls the getSubagentSession RPC method", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        jsonrpc: "2.0", id: 1,
        result: { subSessionId: "child-1", subPiSessionId: "pi-child-1" },
      })),
    );
    const client = new WorkerClient("http://worker.test");
    const r = await client.getSubagentSession({ parentSessionId: "p", toolCallId: "tc-1" });
    expect(r).toEqual({ subSessionId: "child-1", subPiSessionId: "pi-child-1" });
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.method).toBe("getSubagentSession");
    expect(body.params).toEqual({ parentSessionId: "p", toolCallId: "tc-1" });
  });

  it("forwards parentSessionId on getSessionSnapshot", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        jsonrpc: "2.0", id: 1,
        result: { messages: [], cursor: null, running: false },
      })),
    );
    const client = new WorkerClient("http://worker.test");
    await client.getSessionSnapshot({ sessionId: "child-1", parentSessionId: "p" });
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.params).toMatchObject({ sessionId: "child-1", parentSessionId: "p" });
  });
});
