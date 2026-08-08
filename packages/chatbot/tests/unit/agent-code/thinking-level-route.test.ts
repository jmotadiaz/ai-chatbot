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
  thinking: { level: string; levels: string[] } | null;
  getParams: unknown[];
} = vi.hoisted(() => ({
  dbSession: undefined,
  thinking: null,
  getParams: [] as unknown[],
}));

vi.mock("@/lib/features/code/session-store", () => ({
  getSession: vi.fn(async () => mockState.dbSession),
}));

vi.mock("@/lib/features/code/worker-client", () => ({
  WorkerClient: class {
    async getSessionThinkingLevel(params: unknown) {
      mockState.getParams.push(params);
      return { thinking: mockState.thinking };
    }
  },
}));

import { GET } from "@/app/(chat)/api/agent/code/sessions/[sessionId]/thinking-level/route";

function makeGetRequest() {
  return new Request("http://test/api/agent/code/sessions/s1/thinking-level");
}

beforeEach(() => {
  mockState.dbSession = {
    sessionId: "s1",
    project: "p",
    piSessionId: "pi-1",
    modelId: "Deepseek v4 Pro",
  };
  mockState.thinking = null;
  mockState.getParams = [];
});

describe("GET /api/agent/code/sessions/[sessionId]/thinking-level", () => {
  it("returns the worker's level and available levels", async () => {
    mockState.thinking = { level: "high", levels: ["off", "high", "xhigh"] };

    const res = await GET(makeGetRequest() as never);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      thinking: { level: "high", levels: ["off", "high", "xhigh"] },
    });
    expect(mockState.getParams[0]).toEqual({
      sessionId: "s1",
      piSessionId: "pi-1",
      project: "p",
    });
  });

  it("returns thinking: null when the worker has no session yet", async () => {
    const res = await GET(makeGetRequest() as never);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ thinking: null });
  });

  it("returns 404 when the session does not exist", async () => {
    mockState.dbSession = undefined;

    const res = await GET(makeGetRequest() as never);

    expect(res.status).toBe(404);
  });
});
