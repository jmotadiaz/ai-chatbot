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

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  acquireTraceSink: async () => null,
  releaseTraceSink: async () => {},
  retainTraceSink: () => async () => {},
  FileTraceSink: class {
    async open() {}
    async close() {}
  },
  runWithTraceContext: <T>(_ctx: unknown, fn: () => Promise<T>) => fn(),
  getTraceLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    startTimer: () => () => {},
  }),
}));

const mockState: {
  dbSession: { project: string; label?: string | null };
  sendPromptParams: Array<Record<string, unknown>>;
} = vi.hoisted(() => ({
  dbSession: { project: "p", label: "first question" },
  sendPromptParams: [],
}));

vi.mock("@/lib/features/code/session-store", () => ({
  getSession: vi.fn(() => Promise.resolve(mockState.dbSession)),
  touchSession: vi.fn().mockResolvedValue(undefined),
  updateSessionLabel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/features/code/worker-client", () => ({
  WorkerClient: class {
    async initializeSession() {
      return { sessionId: "s" };
    }
    async sendPrompt(params: Record<string, unknown>) {
      mockState.sendPromptParams.push(params);
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });
    }
  },
}));

import { setupGatewayHarness } from "../../helpers/gateway-harness";
import { POST } from "@/app/(chat)/api/agent/code/route";

const gateway = setupGatewayHarness();

function makeRequest(forwardedProps: Record<string, unknown>) {
  return new Request("http://test/api/agent/code", {
    method: "POST",
    body: JSON.stringify({
      threadId: "s",
      runId: "run-1",
      context: [
        { description: "project", value: "p" },
        { description: "sessionId", value: "s" },
        { description: "modelId", value: "Deepseek v4.1 Flash" },
      ],
      messages: [
        { id: "u1", role: "user", content: "first question" },
        { id: "a1", role: "assistant", content: "answer" },
        { id: "u2", role: "user", content: "edited second question" },
      ],
      forwardedProps,
    }),
  });
}

beforeEach(async () => {
  await gateway.use();
  mockState.dbSession = { project: "p", label: "first question" };
  mockState.sendPromptParams = [];
});

describe("POST /api/agent/code with a Message Edit", () => {
  it("forwards branchFromMessageId to the worker inside the same sendPrompt call", async () => {
    const response = await POST(makeRequest({ branchFromMessageId: "u2" }));

    expect(response.status).toBe(200);
    expect(mockState.sendPromptParams).toHaveLength(1);
    const [params] = mockState.sendPromptParams;
    // One atomic call: the rewind travels with the prompt, never as a
    // separate RPC (ADR 0015).
    expect(params!.branchFromMessageId).toBe("u2");
    // The prompt is still the tail message's text, unchanged by the branch.
    expect(params!.prompt).toBe("edited second question");
  });

  it("forwards no branch when there is no Message Edit", async () => {
    await POST(makeRequest({}));

    expect(mockState.sendPromptParams[0]!.branchFromMessageId).toBeUndefined();
  });

  it("rejects a malformed branchFromMessageId instead of forwarding a silent no-op", async () => {
    const empty = await POST(makeRequest({ branchFromMessageId: "" }));
    expect(empty.status).toBe(400);

    const notString = await POST(makeRequest({ branchFromMessageId: 42 }));
    expect(notString.status).toBe(400);

    expect(mockState.sendPromptParams).toHaveLength(0);
  });
});
