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
}));

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createAgentSessionRuntime: async () => ({
    session: { setThinkingLevel: piState.setThinkingLevel },
    services: { modelRegistry: { find: () => undefined } },
  }),
  getAgentDir: () => "/tmp/agent-dir",
  AuthStorage: { create: () => ({}) },
  ModelRegistry: { create: () => ({ find: () => undefined }) },
  SessionManager: {
    list: async () => [{ id: "pi-1", path: piState.sessionFilePath }],
    open: () => ({ getSessionId: () => "pi-1" }),
    create: () => ({ getSessionId: () => "pi-new" }),
  },
}));

const { __resetSessionsForTests, getOrCreateSession } = await import(
  "../../src/session-manager"
);

/**
 * The reload-from-disk path (worker restarted between messages) forces the
 * model the prompt carries, so it must apply the level the prompt carries
 * too — otherwise the session keeps whatever level was persisted for the
 * previous model.
 */
describe("getOrCreateSession thinking level on the disk-reload path", () => {
  let root: string;
  const savedEnv = {
    projects: process.env.CODING_AGENT_PROJECTS_ROOT,
    sessions: process.env.CODING_AGENT_SESSIONS_DIR,
  };

  beforeEach(() => {
    __resetSessionsForTests();
    root = mkdtempSync(join(tmpdir(), "sm-reload-"));
    piState.sessionFilePath = join(root, "pi-1.jsonl");
    piState.setThinkingLevel = vi.fn();
    writeFileSync(piState.sessionFilePath, "");
    process.env.CODING_AGENT_PROJECTS_ROOT = root;
    process.env.CODING_AGENT_SESSIONS_DIR = root;
  });

  afterEach(() => {
    __resetSessionsForTests();
    rmSync(root, { recursive: true, force: true });
    process.env.CODING_AGENT_PROJECTS_ROOT = savedEnv.projects;
    process.env.CODING_AGENT_SESSIONS_DIR = savedEnv.sessions;
  });

  it("applies the level to a session rehydrated from disk", async () => {
    const result = await getOrCreateSession({
      userId: "u1",
      project: "p",
      sessionId: "s1",
      piSessionId: "pi-1",
      modelId: "opencode-go/deepseek-v4-pro",
      thinkingLevel: "xhigh",
    });

    expect(result).toEqual({ sessionId: "s1", piSessionId: "pi-1" });
    expect(piState.setThinkingLevel).toHaveBeenCalledWith("xhigh");
  });

  it("leaves the persisted level alone when the prompt carries none", async () => {
    await getOrCreateSession({
      userId: "u1",
      project: "p",
      sessionId: "s1",
      piSessionId: "pi-1",
    });

    expect(piState.setThinkingLevel).not.toHaveBeenCalled();
  });
});
