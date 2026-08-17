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

const mockState = vi.hoisted(() => ({
  dbSession: undefined as Record<string, unknown> | undefined,
  sessions: [] as { sessionId: string; label: string | null }[],
  prompts: [] as unknown[],
  rpcCalls: [] as unknown[],
  workerError: undefined as Error | undefined,
}));

vi.mock("@/lib/features/code/session-store", () => ({
  getSession: vi.fn(async () => mockState.dbSession),
  listSessions: vi.fn(async () => mockState.sessions),
}));

vi.mock("@/lib/features/code/worker-client", () => ({
  WorkerClient: class {
    async initializeSession(params: unknown) {
      mockState.rpcCalls.push(["initializeSession", params]);
    }
    async getSessionPrompts(params: unknown) {
      mockState.rpcCalls.push(["getSessionPrompts", params]);
      if (mockState.workerError) throw mockState.workerError;
      return { prompts: mockState.prompts };
    }
  },
}));

import { GET } from "@/app/(chat)/api/agent/code/sessions/[sessionId]/prompts/route";

function makeRequest() {
  return new Request("http://test/api/agent/code/sessions/s1/prompts");
}

beforeEach(() => {
  mockState.dbSession = { sessionId: "s1", project: "p" };
  mockState.sessions = [
    { sessionId: "s1", label: "Session A" },
    { sessionId: "s2", label: "Session B" },
  ];
  mockState.prompts = [{ name: "code-review-session" }];
  mockState.rpcCalls = [];
  mockState.workerError = undefined;
});

describe("GET /api/agent/code/sessions/[sessionId]/prompts", () => {
  it("returns prompts and the labeled sessions of the project", async () => {
    const res = await GET(makeRequest() as never);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      prompts: [{ name: "code-review-session" }],
      sessions: [
        { sessionId: "s1", label: "Session A" },
        { sessionId: "s2", label: "Session B" },
      ],
    });
  });

  it("initializes the worker session with the db project before listing prompts", async () => {
    await GET(makeRequest() as never);

    expect(mockState.rpcCalls[0]).toEqual([
      "initializeSession",
      { userId: "user-1", sessionId: "s1", project: "p" },
    ]);
  });

  it("returns empty lists with 404 when the session is not found", async () => {
    mockState.dbSession = undefined;

    const res = await GET(makeRequest() as never);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ prompts: [], sessions: [] });
  });

  it("returns 400 with the worker error message when the worker call fails", async () => {
    mockState.workerError = new Error("worker exploded");

    const res = await GET(makeRequest() as never);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "worker exploded" });
  });
});
