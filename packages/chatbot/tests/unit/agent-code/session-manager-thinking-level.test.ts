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
  applyDefaultThinkingLevel,
  getSessionThinkingLevel,
  setSessionThinkingLevel,
} = await import("coding-agent/session-manager");
const { SessionEventLog } = await import("coding-agent/event-log");

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
    piSessionId: `pi-${sessionId}`,
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
    expect(await setSessionThinkingLevel("missing", "high")).toBeNull();
  });

  it("sets the level and reports the effective level", async () => {
    const session = makeSession();
    seed("t-2", session);
    const result = await setSessionThinkingLevel("t-2", "low");
    expect(session.setThinkingLevel).toHaveBeenCalledWith("low");
    expect(result).toEqual({ level: "low" });
  });

  it("applyDefaultThinkingLevel sets the level only when one is given", () => {
    const session = makeSession();
    const entry = {
      sessionId: "t-3",
      piSessionId: "pi-t-3",
      project: "p",
      runtime: { session } as never,
      eventLog: new SessionEventLog(),
    };
    applyDefaultThinkingLevel(entry as never, "xhigh");
    expect(session.setThinkingLevel).toHaveBeenCalledWith("xhigh");
    applyDefaultThinkingLevel(entry as never, undefined);
    expect(session.setThinkingLevel).toHaveBeenCalledTimes(1);
  });
});
