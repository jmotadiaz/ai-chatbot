import { describe, it, expect, vi } from "vitest";
import { WorkerClient } from "@/lib/features/agent-code/worker-client";

describe("WorkerClient", () => {
  it("sends initializeSession request", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        result: { sessionId: "sess-1" },
        id: 1,
      }),
    });

    const client = new WorkerClient("http://worker.test");
    const result = await client.initializeSession({
      userId: "user-1",
      project: "proj-a",
      modelId: "opencodeGo/deepseek-v4-pro",
    });

    expect(result.sessionId).toBe("sess-1");
    expect(global.fetch).toHaveBeenCalledWith(
      "http://worker.test/rpc",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("initializeSession"),
      }),
    );
  });
});
