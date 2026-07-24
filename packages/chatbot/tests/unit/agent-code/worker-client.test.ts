import { describe, it, expect, vi } from "vitest";
import { WorkerClient, summarizeWorkerRpcParams } from "@/lib/features/code/worker-client";

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

  it("returns UI-safe skills from the session", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        result: {
          skills: [{ name: "code-review", description: "Review code" }],
        },
        id: 1,
      }),
    });

    const client = new WorkerClient("http://worker.test");
    const result = await client.getSessionSkills({ sessionId: "sess-1" });

    expect(result.skills).toEqual([
      { name: "code-review", description: "Review code" },
    ]);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://worker.test/rpc",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("getSessionSkills"),
      }),
    );
  });
});

describe("summarizeWorkerRpcParams", () => {
  it("never includes attachment payloads for sendPrompt, only counts", () => {
    const summary = summarizeWorkerRpcParams("sendPrompt", {
      sessionId: "s1",
      prompt: "hi",
      messages: [
        {
          id: "u1",
          role: "user",
          content: [
            { type: "text", text: "hi" },
            {
              type: "image",
              source: { type: "data", value: "a".repeat(5000), mimeType: "image/png" },
            },
            {
              type: "document",
              source: { type: "data", value: "b".repeat(5000), mimeType: "text/plain" },
              metadata: { filename: "notes.txt" },
            },
          ],
        },
      ],
    });

    expect(summary).toEqual({
      sessionId: "s1",
      promptLength: 2,
      messageCount: 1,
      imageCount: 1,
      documentCount: 1,
      hasTraceRunId: false,
    });
    expect(JSON.stringify(summary)).not.toContain("aaaa");
    expect(JSON.stringify(summary)).not.toContain("bbbb");
  });
});
