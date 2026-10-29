import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const piState = vi.hoisted(() => ({
  sessionFilePath: "",
  setThinkingLevel: undefined as unknown as ReturnType<typeof vi.fn>,
  setModel: undefined as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createAgentSessionRuntime: async () => ({
    session: {
      thinkingLevel: "off",
      getAvailableThinkingLevels: () => ["off", "high", "xhigh"],
      setThinkingLevel: piState.setThinkingLevel,
      setModel: piState.setModel,
      model: { provider: "opencode-go", id: "deepseek-v4-pro" },
      isStreaming: false,
      subscribe: () => () => {},
      prompt: async () => {},
      resourceLoader: { getSkills: () => ({ skills: [] }), getExtensions: () => ({ extensions: [] }), getAppendSystemPrompt: () => [] },
      systemPrompt: "",
      messages: [],
    },
    services: { modelRuntime: { getModel: () => ({ provider: "opencode-go", id: "deepseek-v4-pro" }) } },
  }),
  getAgentDir: () => "/tmp/agent-dir",
  SessionManager: {
    list: async () => [{ id: "s1", path: piState.sessionFilePath }],
    open: () => ({ getSessionId: () => "s1" }),
    create: () => ({ getSessionId: () => "s1" }),
  },
}));

const { SessionRegistry } = await import("../../../src/session/session-registry");
const { TurnRunner } = await import("../../../src/session/turn-runner");
const { createTestWorkerContext } = await import("../../helpers/test-context");

/**
 * After b1, getOrCreateSession is pure seed (modelId for create/reload), and
 * thinkingLevel is turn config applied by TurnRunner.sendPrompt.
 * Reload from disk still seeds the model, but thinking is applied on the turn.
 *
 * ADR 0011 §6: own registry + TurnRunner with the helper's sandbox
 * (projectsRoot/sessionsDir through DI, never process.env).
 */
describe("getOrCreateSession + TurnRunner thinking level after reload", () => {
  let ctx: ReturnType<typeof createTestWorkerContext>;
  let registry: InstanceType<typeof SessionRegistry>;
  let runner: InstanceType<typeof TurnRunner>;

  beforeEach(() => {
    ctx = createTestWorkerContext();
    registry = new SessionRegistry(undefined, ctx.workerConfig);
    runner = new TurnRunner(registry);
    piState.sessionFilePath = join(ctx.root, "s1.jsonl");
    piState.setThinkingLevel = vi.fn();
    piState.setModel = vi.fn();
    writeFileSync(piState.sessionFilePath, "");
  });

  afterEach(() => {
    registry.clear();
    ctx.cleanup();
  });

  it("seeds the model on reload but does not apply thinkingLevel via getOrCreate", async () => {
    const result = await registry.getOrCreateSession({
      userId: "u1",
      project: "p",
      sessionId: "s1",
      modelId: "opencode-go/deepseek-v4-pro",
      thinkingLevel: "xhigh",
    });

    expect(result).toEqual({ sessionId: "s1" });
    // b1: thinkingLevel no longer applied in getOrCreate, only as turn config.
    expect(piState.setThinkingLevel).not.toHaveBeenCalled();
  });

  it("applies thinkingLevel as turn config via sendPrompt (after reload)", async () => {
    // First reload the session (seed)
    await registry.getOrCreateSession({
      userId: "u1",
      project: "p",
      sessionId: "s1",
      modelId: "opencode-go/deepseek-v4-pro",
    });

    // Now start a turn with thinkingLevel — TurnRunner should apply it.
    const stream = await runner.sendPrompt("s1", "hello", undefined, "r1", {
      modelId: "opencode-go/deepseek-v4-pro",
      thinkingLevel: "xhigh",
    });
    await stream.cancel().catch(() => {});

    // The session's setThinkingLevel should have been called with the turn's level.
    expect(piState.setThinkingLevel).toHaveBeenCalledWith("xhigh");
  });

  it("leaves the persisted level alone when the prompt carries none", async () => {
    await registry.getOrCreateSession({
      userId: "u1",
      project: "p",
      sessionId: "s1",
    });
    expect(piState.setThinkingLevel).not.toHaveBeenCalled();

    // Send prompt without thinkingLevel should not call setThinkingLevel
    const stream = await runner.sendPrompt("s1", "hello", undefined, "r2");
    await stream.cancel().catch(() => {});
    expect(piState.setThinkingLevel).not.toHaveBeenCalled();
  });
});
