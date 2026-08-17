import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupMswServer } from "../../helpers/msw-server";
import {
  WorkerClient,
  summarizeWorkerRpcParams,
  type JsonRpcRequest,
} from "@/lib/features/code/worker-client";

const requests: JsonRpcRequest[] = [];
setupMswServer(
  http.post("http://worker.test/rpc", async ({ request }) => {
    const rpc = (await request.json()) as JsonRpcRequest;
    requests.push(rpc);

    const results: Record<string, unknown> = {
      initializeSession: { sessionId: "sess-1" },
      getSessionModel: {
        model: { providerId: "opencode-go", modelId: "kimi-k2.7-code" },
      },
      getSessionSkills: {
        skills: [{ name: "code-review", description: "Review code" }],
      },
    };

    return HttpResponse.json({
      jsonrpc: "2.0",
      result: results[rpc.method],
      id: rpc.id,
    });
  }),
);

beforeEach(() => {
  requests.length = 0;
});

describe("WorkerClient", () => {
  it("sends initializeSession request", async () => {
    const client = new WorkerClient("http://worker.test");
    const result = await client.initializeSession({
      userId: "user-1",
      project: "proj-a",
      modelId: "opencodeGo/deepseek-v4-pro",
    });

    expect(result.sessionId).toBe("sess-1");
    expect(requests[0]).toMatchObject({
      method: "initializeSession",
      params: {
        userId: "user-1",
        project: "proj-a",
        modelId: "opencodeGo/deepseek-v4-pro",
      },
    });
  });

  it("sends getSessionModel request and returns the worker's model", async () => {
    const client = new WorkerClient("http://worker.test");
    const result = await client.getSessionModel({
      sessionId: "sess-1",
      project: "proj-a",
    });

    expect(result.model).toEqual({ providerId: "opencode-go", modelId: "kimi-k2.7-code" });
    expect(requests[0]).toMatchObject({
      method: "getSessionModel",
      params: {
        sessionId: "sess-1",
        project: "proj-a",
      },
    });
  });

  it("returns UI-safe skills from the session", async () => {
    const client = new WorkerClient("http://worker.test");
    const result = await client.getSessionSkills({ sessionId: "sess-1" });

    expect(result.skills).toEqual([
      { name: "code-review", description: "Review code" },
    ]);
    expect(requests[0]).toMatchObject({
      method: "getSessionSkills",
      params: { sessionId: "sess-1" },
    });
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
