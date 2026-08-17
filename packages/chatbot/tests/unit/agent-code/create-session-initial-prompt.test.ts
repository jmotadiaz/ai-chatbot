import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/features/auth/auth-config", () => ({
  auth: async () => ({ user: { id: "user-1" } }),
}));

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
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

vi.mock("config", () => ({
  config: { codingAgentEnabled: () => true },
  optional: <T>(fn: () => T) => fn(),
}));

const state = vi.hoisted(() => ({
  initParams: [] as unknown[],
  sendParams: [] as unknown[],
  streamCancelled: false,
  savedLabel: null as string | null,
  sendRejects: false,
  deleteCalls: [] as Array<{ userId: string; sessionId: string }>,
}));

vi.mock("@/lib/features/code/worker-client", () => ({
  WorkerClient: class {
    async initializeSession(params: unknown) {
      state.initParams.push(params);
      return { sessionId: "s1" };
    }
    async sendPrompt(params: unknown) {
      if (state.sendRejects) {
        throw new Error("Worker unreachable");
      }
      state.sendParams.push(params);
      return {
        cancel: async () => {
          state.streamCancelled = true;
        },
      };
    }
  },
}));

vi.mock("@/lib/features/code/session-store", () => ({
  createSession: vi.fn(async () => ({
    sessionId: "s1",
    userId: "user-1",
    project: "p",
    modelId: "Deepseek v4 Pro",
    label: null,
    updatedAt: new Date(),
  })),
  updateSessionLabel: vi.fn(async (input: { label: string }) => {
    state.savedLabel = input.label;
  }),
  deleteSession: vi.fn(async (input: { userId: string; sessionId: string }) => {
    state.deleteCalls.push(input);
  }),
  getSession: vi.fn(),
}));

import { createCodingAgentSession } from "@/lib/features/code/actions";

beforeEach(() => {
  state.initParams = [];
  state.sendParams = [];
  state.streamCancelled = false;
  state.savedLabel = null;
});

describe("createCodingAgentSession", () => {
  it("creates the row and starts the detached run with the initial prompt", async () => {
    const result = await createCodingAgentSession(
      "p",
      "Deepseek v4 Pro",
      "# Task\n\nRefactor this.",
    );

    expect(result.sessionId).toBe("s1");

    const init = state.initParams[0] as {
      sessionId: string;
      project: string;
      modelId?: string;
      thinkingLevel?: string;
      _traceRunId?: string;
    };
    expect(init.sessionId).toBe("s1");
    expect(init.project).toBe("p");
    expect(init.modelId).toBe("opencode-go/deepseek-v4-pro");
    expect(init.thinkingLevel).toBe("xhigh");
    expect(init._traceRunId).toBeTruthy();

    const send = state.sendParams[0] as {
      sessionId: string;
      prompt: string;
      _traceRunId?: string;
    };
    expect(send.sessionId).toBe("s1");
    expect(send.prompt).toBe("# Task\n\nRefactor this.");
    expect(send._traceRunId).toBe(init._traceRunId);

    // The request's stream is cancelled so the action returns immediately,
    // but the worker turn keeps running (detached); events stay in its log.
    expect(state.streamCancelled).toBe(true);
  });

  it("labels the session with the first line of the prompt", async () => {
    await createCodingAgentSession("p", "Deepseek v4 Pro", "Fix the bug\n\nDetails here.");
    expect(state.savedLabel).toBe("Fix the bug");
  });

  it("skips the worker entirely when no initial prompt is given", async () => {
    const result = await createCodingAgentSession("p");
    expect(result.sessionId).toBe("s1");
    expect(state.initParams).toHaveLength(0);
    expect(state.sendParams).toHaveLength(0);
    expect(state.savedLabel).toBeNull();
  });

  it("deletes the session row when startInitialRun fails and rethrows", async () => {
    state.sendRejects = true;

    await expect(
      createCodingAgentSession("p", "Deepseek v4 Pro", "# Fail"),
    ).rejects.toThrow("Worker unreachable");

    expect(state.deleteCalls).toEqual([
      { userId: "user-1", sessionId: "s1" },
    ]);
  });
});
