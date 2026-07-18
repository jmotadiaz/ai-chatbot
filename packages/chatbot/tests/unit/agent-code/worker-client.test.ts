import { describe, it, expect, vi } from "vitest";
import { WorkerClient } from "@/lib/features/code/worker-client";

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

  it("sends getSessionModel request and returns the worker's model", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        result: { model: { providerId: "opencode-go", modelId: "kimi-k2.6" } },
        id: 1,
      }),
    });

    const client = new WorkerClient("http://worker.test");
    const result = await client.getSessionModel({
      sessionId: "sess-1",
      piSessionId: "pi-1",
      project: "proj-a",
    });

    expect(result.model).toEqual({ providerId: "opencode-go", modelId: "kimi-k2.6" });
    expect(global.fetch).toHaveBeenCalledWith(
      "http://worker.test/rpc",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("getSessionModel"),
      }),
    );
  });
});
