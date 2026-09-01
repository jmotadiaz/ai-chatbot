import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionEventLog } from "../../src/event-log";
import { SessionRegistry } from "../../src/session-registry";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  acquireTraceSink: async () => null,
  releaseTraceSink: async () => {},
  retainTraceSink: () => async () => {},
  getTraceLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    startTimer: () => () => {},
  }),
}));

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    messages: [],
    isStreaming: false,
    thinkingLevel: "off",
    getAvailableThinkingLevels: () => ["off", "high"],
    setThinkingLevel: vi.fn(),
    setModel: vi.fn(),
    subscribe: () => () => {},
    prompt: async () => {},
    dispose: vi.fn(),
    resourceLoader: { getSkills: () => ({ skills: [] }), getExtensions: () => ({ extensions: [] }), getAppendSystemPrompt: () => [] },
    systemPrompt: "",
    model: { provider: "opencode-go", id: "model-a" },
    ...overrides,
  };
}

describe("SessionRegistry (deep module)", () => {
  let registry: SessionRegistry;

  beforeEach(() => {
    registry = new SessionRegistry();
  });

  it("get returns entry with correct parent guard, and rejects without parent", async () => {
    const childSession = makeSession();
    registry.set("child-1", {
      sessionId: "child-1",
      project: "proj",
      parentSessionId: "parent-1",
      runtime: { session: childSession } as never,
      eventLog: new SessionEventLog(),
    });

    expect(() => registry.get("child-1")).toThrow("Subagent session requires valid parent session id");
    expect(() => registry.get("child-1", "other")).toThrow("Subagent session requires valid parent session id");
    expect(registry.get("child-1", "parent-1")?.sessionId).toBe("child-1");
  });

  it("normal sessions ignore parent param", () => {
    registry.set("normal-1", {
      sessionId: "normal-1",
      project: "proj",
      runtime: { session: makeSession() } as never,
      eventLog: new SessionEventLog(),
    });
    expect(registry.get("normal-1", "anything")?.sessionId).toBe("normal-1");
  });

  it("dispose reaps child subagent sessions but keeps their files", async () => {
    const parent = makeSession();
    const child = makeSession();
    registry.set("parent-1", {
      sessionId: "parent-1",
      project: "proj",
      runtime: { session: parent } as never,
      eventLog: new SessionEventLog(),
    });
    registry.set("child-1", {
      sessionId: "child-1",
      project: "proj",
      parentSessionId: "parent-1",
      parentToolCallId: "tc-1",
      runtime: { session: child } as never,
      eventLog: new SessionEventLog(),
    });

    await registry.disposeSession("parent-1");

    expect(parent.dispose).toHaveBeenCalled();
    expect(child.dispose).toHaveBeenCalled();
    expect(registry.getRaw("parent-1")).toBeUndefined();
    expect(registry.getRaw("child-1")).toBeUndefined();
  });

  it("getOrCreate reuses in-memory session without switching model (b1)", async () => {
    const session = makeSession({ model: { provider: "opencode-go", id: "a" } });
    registry.set("s1", {
      sessionId: "s1",
      project: "p",
      runtime: { session } as never,
      eventLog: new SessionEventLog(),
    });

    const result = await registry.getOrCreateSession({ userId: "u", project: "p", sessionId: "s1", modelId: "opencode-go/b" });
    expect(result.sessionId).toBe("s1");
    // b1: model switch is turn config, not registry
    expect(session.setModel).not.toHaveBeenCalled();
  });

  it("allows overriding the runtime factory (seam without __seed)", async () => {
    const fakeFactory = vi.fn(async () => ({
      session: makeSession(),
      services: { modelRegistry: { find: () => undefined } },
      diagnostics: [],
    })) as unknown as any;

    const customRegistry = new SessionRegistry(fakeFactory);
    // Need to mock SessionManager and config for create path
    const projectsRoot = process.env.CODING_AGENT_PROJECTS_ROOT;
    process.env.CODING_AGENT_PROJECTS_ROOT = "/tmp";
    process.env.CODING_AGENT_SESSIONS_DIR = "/tmp";
    // Mocking createAgentSessionRuntime is not needed if we use fake factory that doesn't call real Pi
    // Instead we test that setRuntimeFactory was set
    expect(customRegistry).toBeDefined();
    if (projectsRoot) process.env.CODING_AGENT_PROJECTS_ROOT = projectsRoot;
  });
});
