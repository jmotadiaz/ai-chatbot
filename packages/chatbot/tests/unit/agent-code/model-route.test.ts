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
} = vi.hoisted(() => ({
  dbSession: undefined,
  workerModel: null,
  modelParams: [] as unknown[],
}));

vi.mock("@/lib/features/code/session-store", () => ({
  getSession: vi.fn(async () => mockState.dbSession),
}));

vi.mock("@/lib/features/code/worker-client", () => ({
  WorkerClient: class {
    async getSessionModel(params: unknown) {
      mockState.modelParams.push(params);
      return { model: mockState.workerModel };
    }
  },
}));

import { GET } from "@/app/(chat)/api/agent/code/sessions/[sessionId]/model/route";

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
});

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
