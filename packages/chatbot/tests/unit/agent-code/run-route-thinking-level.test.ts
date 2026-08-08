import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/features/auth/with-auth/handler", () => ({
  withAuth:
    <T>(handler: T) =>
    async (req: Request) =>
      (handler as never as (user: { id: string }, req: Request) => Promise<Response>)(
        { id: "user-1" },
        req,
      ),
}));

const mockState: {
  dbSession: Record<string, unknown> | undefined;
  initParams: unknown[];
} = vi.hoisted(() => ({
  dbSession: undefined,
  initParams: [] as unknown[],
}));

vi.mock("@/lib/features/code/session-store", () => ({
  getSession: vi.fn(async () => mockState.dbSession),
  touchSession: vi.fn(async () => {}),
  updatePiSessionId: vi.fn(async () => {}),
  updateSessionLabel: vi.fn(async () => {}),
}));

vi.mock("@/lib/features/code/worker-client", () => ({
  WorkerClient: class {
    async initializeSession(params: unknown) {
      mockState.initParams.push(params);
      return { sessionId: "s1", piSessionId: "pi-1" };
    }
    async sendPrompt() {
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });
    }
  },
}));

import { POST } from "@/app/(chat)/api/agent/code/route";

function makeRequest() {
  return new Request("http://test/api/agent/code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      threadId: "s1",
      context: [
        { description: "project", value: "p" },
        { description: "sessionId", value: "s1" },
        { description: "modelId", value: "Deepseek v4 Pro" },
      ],
      messages: [{ id: "u1", role: "user", content: "hola" }],
      runId: "r1",
    }),
  });
}

beforeEach(() => {
  mockState.dbSession = {
    sessionId: "s1",
    project: "p",
    piSessionId: null,
    label: null,
  };
  mockState.initParams = [];
});

describe("POST /api/agent/code", () => {
  it("passes the catalog defaultThinkingLevel for the selected model", async () => {
    const res = await POST(makeRequest() as never);

    expect(res.status).toBe(200);
    const init = mockState.initParams[0] as {
      modelId?: string;
      defaultThinkingLevel?: string;
    };
    expect(init.modelId).toBe("opencode-go/deepseek-v4-pro");
    expect(init.defaultThinkingLevel).toBe("xhigh");
  });

  it("passes the catalog default for every invocable model", async () => {
    const req = new Request("http://test/api/agent/code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: "s1",
        context: [
          { description: "project", value: "p" },
          { description: "sessionId", value: "s1" },
          { description: "modelId", value: "Kimi K3" },
        ],
        messages: [{ id: "u1", role: "user", content: "hola" }],
        runId: "r2",
      }),
    });
    mockState.dbSession = { sessionId: "s1", project: "p", piSessionId: null, label: null };

    const res = await POST(req as never);

    expect(res.status).toBe(200);
    const init = mockState.initParams[0] as {
      defaultThinkingLevel?: string;
    };
    expect(init.defaultThinkingLevel).toBe("high");
  });
});
