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
  workerModel: { providerId: string; modelId: string } | null;
  modelParams: unknown[];
  initParams: unknown[];
  updatePiSessionIdCalls: unknown[];
} = vi.hoisted(() => ({
  dbSession: undefined,
  workerModel: null,
  modelParams: [] as unknown[],
  initParams: [] as unknown[],
  updatePiSessionIdCalls: [] as unknown[],
}));

vi.mock("@/lib/features/code/session-store", () => ({
  getSession: vi.fn(async () => mockState.dbSession),
  updatePiSessionId: vi.fn(async (params: unknown) => {
    mockState.updatePiSessionIdCalls.push(params);
  }),
}));

vi.mock("@/lib/features/code/worker-client", () => ({
  WorkerClient: class {
    async getSessionModel(params: unknown) {
      mockState.modelParams.push(params);
      return { model: mockState.workerModel };
    }

    async initializeSession(params: unknown) {
      mockState.initParams.push(params);
      return { sessionId: "s1", piSessionId: "pi-1" };
    }
  },
}));

import { GET, POST } from "@/app/(chat)/api/agent/code/sessions/[sessionId]/model/route";

function makeRequest() {
  return new Request("http://test/api/agent/code/sessions/s1/model");
}

beforeEach(() => {
  mockState.dbSession = {
    sessionId: "s1",
    project: "p",
    piSessionId: "pi-1",
    modelId: "Deepseek v4 Pro",
  };
  mockState.workerModel = null;
  mockState.modelParams = [];
  mockState.initParams = [];
  mockState.updatePiSessionIdCalls = [];
});

function makePostRequest(body?: unknown) {
  return new Request("http://test/api/agent/code/sessions/s1/model", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("GET /api/agent/code/sessions/[sessionId]/model", () => {
  it("returns the worker's model mapped to a chat model id", async () => {
    mockState.workerModel = { providerId: "opencode-go", modelId: "kimi-k2.7-code" };

    const res = await GET(makeRequest() as never);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ modelId: "Kimi K2.7 Code" });
    expect(mockState.modelParams[0]).toEqual({
      sessionId: "s1",
      piSessionId: "pi-1",
      project: "p",
    });
  });

  it("falls back to the DB model when the worker has no session material", async () => {
    mockState.workerModel = null;

    const res = await GET(makeRequest() as never);

    expect(await res.json()).toEqual({ modelId: "Deepseek v4 Pro" });
  });

  it("falls back to the DB model when the worker model is not a known chat model", async () => {
    mockState.workerModel = { providerId: "other-provider", modelId: "mystery" };

    const res = await GET(makeRequest() as never);

    expect(await res.json()).toEqual({ modelId: "Deepseek v4 Pro" });
  });

  it("returns null when neither the worker nor the DB know a model", async () => {
    mockState.dbSession = { sessionId: "s1", project: "p", piSessionId: null, modelId: null };

    const res = await GET(makeRequest() as never);

    expect(await res.json()).toEqual({ modelId: null });
  });

  it("returns 404 when the session does not belong to the user", async () => {
    mockState.dbSession = undefined;

    const res = await GET(makeRequest() as never);

    expect(res.status).toBe(404);
  });
});

describe("POST /api/agent/code/sessions/[sessionId]/model", () => {
  it("applies the model to the worker session immediately", async () => {
    const res = await POST(makePostRequest({ modelId: "Deepseek v4 Pro" }) as never);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ modelId: "Deepseek v4 Pro" });
    expect(mockState.initParams).toEqual([
      {
        userId: "user-1",
        sessionId: "s1",
        project: "p",
        modelId: "opencode-go/deepseek-v4-pro",
        defaultThinkingLevel: "xhigh",
        piSessionId: "pi-1",
      },
    ]);
    // The worker returned the same piSessionId the DB already has: no update.
    expect(mockState.updatePiSessionIdCalls).toEqual([]);
  });

  it("persists a new piSessionId when the model POST is the first worker contact", async () => {
    mockState.dbSession = {
      sessionId: "s1",
      project: "p",
      piSessionId: null,
      modelId: "Deepseek v4 Pro",
    };

    const res = await POST(makePostRequest({ modelId: "Deepseek v4 Pro" }) as never);

    expect(res.status).toBe(200);
    expect(mockState.updatePiSessionIdCalls).toEqual([
      { userId: "user-1", sessionId: "s1", piSessionId: "pi-1" },
    ]);
  });

  it("returns 400 when modelId is missing", async () => {
    const res = await POST(makePostRequest({}) as never);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "modelId is required" });
    expect(mockState.initParams).toEqual([]);
  });

  it("returns 400 when the model is not invocable in the coding agent", async () => {
    const res = await POST(makePostRequest({ modelId: "StepFun 3.5" }) as never);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Unknown model: StepFun 3.5" });
    expect(mockState.initParams).toEqual([]);
  });

  it("returns 404 when the session does not belong to the user", async () => {
    mockState.dbSession = undefined;

    const res = await POST(makePostRequest({ modelId: "Deepseek v4 Pro" }) as never);

    expect(res.status).toBe(404);
    expect(mockState.initParams).toEqual([]);
  });
});
