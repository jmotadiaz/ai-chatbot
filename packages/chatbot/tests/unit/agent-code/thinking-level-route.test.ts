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
  levelAfterSet: string | null;
  getParams: unknown[];
  setParams: unknown[];
} = vi.hoisted(() => ({
  dbSession: undefined,
  thinking: null,
  levelAfterSet: null,
  getParams: [] as unknown[],
  setParams: [] as unknown[],
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
    async setSessionThinkingLevel(params: unknown) {
      mockState.setParams.push(params);
      return { thinking: { level: mockState.levelAfterSet } };
    }
  },
}));

import { GET, POST } from "@/app/(chat)/api/agent/code/sessions/[sessionId]/thinking-level/route";

function makeGetRequest() {
  return new Request("http://test/api/agent/code/sessions/s1/thinking-level");
}

function makePostRequest(level: string) {
  return new Request("http://test/api/agent/code/sessions/s1/thinking-level", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level }),
  });
}

beforeEach(() => {
  mockState.dbSession = {
    sessionId: "s1",
    project: "p",
    piSessionId: "pi-1",
    modelId: "Deepseek v4 Pro",
  };
  mockState.thinking = null;
  mockState.levelAfterSet = null;
  mockState.getParams = [];
  mockState.setParams = [];
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

  it("returns 404 when the session does not exist", async () => {
    mockState.dbSession = undefined;

    const res = await GET(makeGetRequest() as never);

    expect(res.status).toBe(404);
  });
});

describe("POST /api/agent/code/sessions/[sessionId]/thinking-level", () => {
  it("sets the level and returns the effective level", async () => {
    mockState.levelAfterSet = "xhigh";

    const res = await POST(makePostRequest("xhigh") as never);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ thinking: { level: "xhigh" } });
    expect(mockState.setParams[0]).toEqual({
      sessionId: "s1",
      level: "xhigh",
      piSessionId: "pi-1",
      project: "p",
    });
  });

  it("returns 400 when level is missing", async () => {
    const res = await POST(makePostRequest("") as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid level", async () => {
    const res = await POST(makePostRequest("ultra") as never);
    expect(res.status).toBe(400);
    expect(mockState.setParams).toHaveLength(0);
  });
});
