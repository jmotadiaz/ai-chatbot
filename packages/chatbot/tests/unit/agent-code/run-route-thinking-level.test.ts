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

function makeRequest(
  options: { modelId?: string; thinkingLevel?: string; runId?: string } = {},
) {
  const { modelId = "Deepseek v4 Pro", thinkingLevel, runId = "r1" } = options;
  return new Request("http://test/api/agent/code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      threadId: "s1",
      context: [
        { description: "project", value: "p" },
        { description: "sessionId", value: "s1" },
        { description: "modelId", value: modelId },
        ...(thinkingLevel === undefined
          ? []
          : [{ description: "thinkingLevel", value: thinkingLevel }]),
      ],
      messages: [{ id: "u1", role: "user", content: "hola" }],
      runId,
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
  it("forwards the level the prompt carries", async () => {
    const res = await POST(makeRequest({ thinkingLevel: "low" }) as never);

    expect(res.status).toBe(200);
    const init = mockState.initParams[0] as {
      modelId?: string;
      thinkingLevel?: string;
    };
    expect(init.modelId).toBe("opencode-go/deepseek-v4-pro");
    expect(init.thinkingLevel).toBe("low");
  });

  it("falls back to the catalog default when the prompt carries no level", async () => {
    const res = await POST(makeRequest() as never);

    expect(res.status).toBe(200);
    const init = mockState.initParams[0] as { thinkingLevel?: string };
    expect(init.thinkingLevel).toBe("xhigh");
  });

  it("falls back to the catalog default when the level is not a valid one", async () => {
    const res = await POST(makeRequest({ thinkingLevel: "ultra" }) as never);

    expect(res.status).toBe(200);
    const init = mockState.initParams[0] as { thinkingLevel?: string };
    expect(init.thinkingLevel).toBe("xhigh");
  });

  it("uses each model's own catalog default", async () => {
    const res = await POST(
      makeRequest({ modelId: "Kimi K3", runId: "r2" }) as never,
    );

    expect(res.status).toBe(200);
    const init = mockState.initParams[0] as { thinkingLevel?: string };
    expect(init.thinkingLevel).toBe("high");
  });
});
