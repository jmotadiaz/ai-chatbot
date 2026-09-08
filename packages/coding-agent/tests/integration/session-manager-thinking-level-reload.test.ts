import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

const { getOrCreateSession, sendPrompt } = await import("../../src/session/session-manager");
const { sessionRegistry } = await import("../../src/session/session-registry");

/**
 * After b1, getOrCreateSession is pure seed (modelId for create/reload), and
 * thinkingLevel is turn config applied by TurnRunner.sendPrompt.
 * Reload from disk still seeds the model, but thinking is applied on the turn.
 */
describe("getOrCreateSession + TurnRunner thinking level after reload", () => {
  let root: string;
  const savedEnv = {
    projects: process.env.CODING_AGENT_PROJECTS_ROOT,
    sessions: process.env.CODING_AGENT_SESSIONS_DIR,
  };

  beforeEach(() => {
    sessionRegistry.clear();
    root = mkdtempSync(join(tmpdir(), "sm-reload-"));
    piState.sessionFilePath = join(root, "s1.jsonl");
    piState.setThinkingLevel = vi.fn();
    piState.setModel = vi.fn();
    writeFileSync(piState.sessionFilePath, "");
    process.env.CODING_AGENT_PROJECTS_ROOT = root;
    process.env.CODING_AGENT_SESSIONS_DIR = root;
  });

  afterEach(() => {
    sessionRegistry.clear();
    rmSync(root, { recursive: true, force: true });
    process.env.CODING_AGENT_PROJECTS_ROOT = savedEnv.projects;
    process.env.CODING_AGENT_SESSIONS_DIR = savedEnv.sessions;
  });

  it("seeds the model on reload but does not apply thinkingLevel via getOrCreate", async () => {
    const result = await getOrCreateSession({
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
    await getOrCreateSession({
      userId: "u1",
      project: "p",
      sessionId: "s1",
      modelId: "opencode-go/deepseek-v4-pro",
    });

    // Now start a turn with thinkingLevel — TurnRunner should apply it.
    const stream = await sendPrompt("s1", "hello", undefined, "r1", "opencode-go/deepseek-v4-pro", "xhigh");
    await stream.cancel().catch(() => {});

    // The session's setThinkingLevel should have been called with the turn's level.
    expect(piState.setThinkingLevel).toHaveBeenCalledWith("xhigh");
  });

  it("leaves the persisted level alone when the prompt carries none", async () => {
    await getOrCreateSession({
      userId: "u1",
      project: "p",
      sessionId: "s1",
    });
    expect(piState.setThinkingLevel).not.toHaveBeenCalled();

    // Send prompt without thinkingLevel should not call setThinkingLevel
    const stream = await sendPrompt("s1", "hello", undefined, "r2");
    await stream.cancel().catch(() => {});
    expect(piState.setThinkingLevel).not.toHaveBeenCalled();
  });
});
