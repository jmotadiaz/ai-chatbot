import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  acquireTraceSink: async () => null,
  releaseTraceSink: async () => {},
  retainTraceSink: () => async () => {},
  setTraceSessionId: () => {},
  getTraceLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    startTimer: () => () => {},
  }),
}));

const {
  __resetSessionsForTests,
  __seedSessionForTests,
  applyThinkingLevel,
  getSessionThinkingLevel,
} = await import("../../src/session-manager");
const { SessionEventLog } = await import("../../src/event-log");

function makeSession(overrides: Record<string, unknown> = {}) {
  const session = {
    thinkingLevel: "high",
    getAvailableThinkingLevels: () => ["off", "high", "xhigh"],
    setThinkingLevel: vi.fn((level: string) => {
      session.thinkingLevel = level;
    }),
    ...overrides,
  };
  return session;
}

function seed(sessionId: string, session: unknown) {
  __seedSessionForTests(sessionId, {
    sessionId,
    project: "p",
    runtime: { session } as never,
    eventLog: new SessionEventLog(),
  });
}

beforeEach(() => {
  __resetSessionsForTests();
});

describe("session-manager thinking level", () => {
  it("returns the current level and the model's available levels", async () => {
    seed("t-1", makeSession());
    expect(await getSessionThinkingLevel("t-1")).toEqual({
      level: "high",
      levels: ["off", "high", "xhigh"],
    });
  });

  it("returns null when the session does not exist", async () => {
    expect(await getSessionThinkingLevel("missing")).toBeNull();
  });

  it("applyThinkingLevel sets the level only when one is given", () => {
    const session = makeSession();
    applyThinkingLevel(session as never, "xhigh");
    expect(session.setThinkingLevel).toHaveBeenCalledWith("xhigh");
    applyThinkingLevel(session as never, undefined);
    expect(session.setThinkingLevel).toHaveBeenCalledTimes(1);
  });

  it("routes getSessionThinkingLevel through the RPC handler", async () => {
    const { handleRpc } = await import("../../src/transports/http");
    seed("t-4", makeSession());
    const res = await handleRpc(
      JSON.stringify({ method: "getSessionThinkingLevel", params: { sessionId: "t-4" }, id: 1 }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { thinking: unknown } };
    expect(body.result.thinking).toEqual({ level: "high", levels: ["off", "high", "xhigh"] });
  });

  it("applies the level on a plain reuse, with no model change", async () => {
    const { handleRpc } = await import("../../src/transports/http");
    const setThinkingLevel = vi.fn();
    const setModel = vi.fn();
    __seedSessionForTests("t-5", {
      sessionId: "t-5",
      project: "p",
      runtime: {
        session: {
          model: { provider: "opencode-go", id: "deepseek-v4-pro" },
          setModel,
          setThinkingLevel,
        },
        services: {
          modelRegistry: {
            find: () => ({ provider: "opencode-go", id: "deepseek-v4-pro" }),
          },
        },
      } as never,
      eventLog: new SessionEventLog(),
    });

    // Cambiar solo el nivel (mismo modelo) es el caso normal del control de
    // razonamiento: tiene que llegar a la sesión igual.
    const res = await handleRpc(
      JSON.stringify({
        method: "initializeSession",
        params: {
          userId: "u1",
          sessionId: "t-5",
          project: "p",
          modelId: "opencode-go/deepseek-v4-pro",
          thinkingLevel: "low",
        },
        id: 2,
      }),
    );

    expect(res.status).toBe(200);
    expect(setModel).not.toHaveBeenCalled();
    expect(setThinkingLevel).toHaveBeenCalledWith("low");
  });

  it("wires initializeSession thinkingLevel through handleRpc into the session runtime", async () => {
    const { handleRpc } = await import("../../src/transports/http");
    const setThinkingLevel = vi.fn();
    // The session is already in memory with a different model; the reuse path
    // in getOrCreateSession must switch the model and then apply the level.
    __seedSessionForTests("t-6", {
      sessionId: "t-6",
      project: "p",
      runtime: {
        session: {
          model: { provider: "opencode-go", id: "deepseek-v4-flash" },
          setModel: vi.fn(),
          setThinkingLevel,
        },
        services: {
          modelRegistry: {
            find: () => ({ provider: "opencode-go", id: "deepseek-v4-pro" }),
          },
        },
      } as never,
      eventLog: new SessionEventLog(),
    });

    const res = await handleRpc(
      JSON.stringify({
        method: "initializeSession",
        params: {
          userId: "u1",
          sessionId: "t-6",
          project: "p",
          modelId: "opencode-go/deepseek-v4-pro",
          thinkingLevel: "low",
        },
        id: 3,
      }),
    );

    expect(res.status).toBe(200);
    expect(setThinkingLevel).toHaveBeenCalledWith("low");
  });

  it("rejects a model change while the session is streaming", async () => {
    const { handleRpc } = await import("../../src/transports/http");
    const setModel = vi.fn();
    __seedSessionForTests("t-7", {
      sessionId: "t-7",
      project: "p",
      runtime: {
        session: {
          isStreaming: true,
          model: { provider: "opencode-go", id: "deepseek-v4-flash" },
          setModel,
        },
        services: {
          modelRegistry: {
            find: () => ({ provider: "opencode-go", id: "deepseek-v4-pro" }),
          },
        },
      } as never,
      eventLog: new SessionEventLog(),
    });

    const res = await handleRpc(
      JSON.stringify({
        method: "initializeSession",
        params: {
          userId: "u1",
          sessionId: "t-7",
          project: "p",
          modelId: "opencode-go/deepseek-v4-pro",
          thinkingLevel: "low",
        },
        id: 4,
      }),
    );

    const body = (await res.json()) as {
      error?: { code: number; message: string };
    };
    expect(body.error).toBeTruthy();
    expect(body.error?.message).toBe("Cannot change model while the agent is running");
    // The mid-run switch must never reach the Pi session.
    expect(setModel).not.toHaveBeenCalled();
  });

  it("allows initializeSession with the same model while streaming", async () => {
    const { handleRpc } = await import("../../src/transports/http");
    const setModel = vi.fn();
    __seedSessionForTests("t-8", {
      sessionId: "t-8",
      project: "p",
      runtime: {
        session: {
          isStreaming: true,
          model: { provider: "opencode-go", id: "deepseek-v4-pro" },
          setModel,
        },
        services: {
          modelRegistry: {
            find: () => ({ provider: "opencode-go", id: "deepseek-v4-pro" }),
          },
        },
      } as never,
      eventLog: new SessionEventLog(),
    });

    const res = await handleRpc(
      JSON.stringify({
        method: "initializeSession",
        params: {
          userId: "u1",
          sessionId: "t-8",
          project: "p",
          modelId: "opencode-go/deepseek-v4-pro",
        },
        id: 5,
      }),
    );

    expect(res.status).toBe(200);
    expect(setModel).not.toHaveBeenCalled();
  });
});
