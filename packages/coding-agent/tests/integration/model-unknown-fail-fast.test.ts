import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
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
  sessionId: "s1",
  getModelCalls: [] as Array<[string, string]>,
}));

// Light Pi mocks: the factory (`makeCreateRuntime`) and the session-registry
// run for real, but Pi's heavy service assembly is stubbed out.
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createAgentSessionRuntime: async (
    factory: (ctx: unknown) => Promise<unknown>,
    ctx: { cwd: string },
  ) => {
    // Invoke the real factory so its model-unknown handling is exercised.
    return await factory({
      cwd: ctx.cwd,
      sessionManager: { getSessionId: () => piState.sessionId },
    });
  },
  createAgentSessionServices: async () => ({
    modelRuntime: {
      getModel: (provider: string, id: string) => {
        piState.getModelCalls.push([provider, id]);
        return provider === "model-gateway" && id in CATALOG_IDS
          ? { provider, id }
          : undefined;
      },
    },
    resourceLoader: {
      getSkills: () => ({ skills: [] }),
      getExtensions: () => ({ extensions: [] }),
      getAppendSystemPrompt: () => [],
    },
    diagnostics: [],
  }),
  createAgentSessionFromServices: async () => ({
    session: {
      model: undefined,
      thinkingLevel: "off",
      isStreaming: false,
      subscribe: () => () => {},
      prompt: async () => {},
      setModel: async () => {},
      resourceLoader: {
        getSkills: () => ({ skills: [] }),
        getExtensions: () => ({ extensions: [] }),
        getAppendSystemPrompt: () => [],
      },
      systemPrompt: "",
      messages: [],
      bindExtensions: async () => {},
    },
  }),
  getAgentDir: () => "/tmp/agent-dir",
  SessionManager: {
    list: async () => [{ id: "s1", path: piState.sessionFilePath }],
    open: () => ({ getSessionId: () => "s1" }),
    create: () => ({ getSessionId: () => "s1" }),
  },
}));

const CATALOG_IDS = { "Kimi K3": true } as Record<string, boolean>;

const { getOrCreateSession, sendPrompt } = await import("../../src/session/session-manager");
const { sessionRegistry } = await import("../../src/session/session-registry");

/**
 * An unknown modelId must stop failing silently (Pi default / previous model
 * kept): session creation rejects with an explicit error and the turn fails
 * in-band with RUN_ERROR.
 */
describe("unknown modelId fails explicitly", () => {
  let root: string;
  const savedEnv = {
    projects: process.env.CODING_AGENT_PROJECTS_ROOT,
    sessions: process.env.CODING_AGENT_SESSIONS_DIR,
  };

  beforeEach(() => {
    sessionRegistry.clear();
    root = mkdtempSync(join(tmpdir(), "model-unknown-"));
    // Pi resolves the transcript under <agentDir>/sessions/--<encoded>--; the
    // lookup tests pin the encoding, mirrored here for the reload path.
    const encoded = root.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-");
    piState.sessionFilePath = join("/tmp/agent-dir", "sessions", `--${encoded}--`, "s1.jsonl");
    piState.getModelCalls = [];
    process.env.CODING_AGENT_PROJECTS_ROOT = root;
    process.env.CODING_AGENT_SESSIONS_DIR = root;
  });

  afterEach(() => {
    sessionRegistry.clear();
    rmSync(root, { recursive: true, force: true });
    process.env.CODING_AGENT_PROJECTS_ROOT = savedEnv.projects;
    process.env.CODING_AGENT_SESSIONS_DIR = savedEnv.sessions;
  });

  it("rejects getOrCreateSession with an unknown modelId on the create path", async () => {
    await expect(
      getOrCreateSession({ userId: "u1", project: "p", modelId: "ghost-model" }),
    ).rejects.toThrow(/ghost-model/);
  });

  it("does not throw on the reload path with an unknown modelId (persisted obsolete model)", async () => {
    mkdirSync(dirname(piState.sessionFilePath), { recursive: true }); writeFileSync(piState.sessionFilePath, "");
    const result = await getOrCreateSession({
      userId: "u1",
      project: "p",
      sessionId: "s1",
      modelId: "ghost-model",
    });
    expect(result).toEqual({ sessionId: "s1" });
    // The factory resolved the reference (strict check off on reload) but the
    // catalog has no such id.
    expect(piState.getModelCalls).toContainEqual(["model-gateway", "ghost-model"]);
  });

  it("fails the turn in-band with RUN_ERROR when the turn's modelId is unknown", async () => {
    mkdirSync(dirname(piState.sessionFilePath), { recursive: true }); writeFileSync(piState.sessionFilePath, "");
    await getOrCreateSession({ userId: "u1", project: "p", sessionId: "s1" });

    const stream = await sendPrompt("s1", "hello", undefined, "r1", "ghost-model");
    const text = await new Response(stream).text();
    const events = text
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as { event: { type: string; message?: string } })
      .map((wrapped) => wrapped.event);
    const runError = events.find((event) => event.type === "RUN_ERROR");
    expect(runError).toBeDefined();
    expect(String(runError?.message)).toContain("ghost-model");
  });

  it("starts the run normally when the turn's modelId is known", async () => {
    mkdirSync(dirname(piState.sessionFilePath), { recursive: true }); writeFileSync(piState.sessionFilePath, "");
    await getOrCreateSession({ userId: "u1", project: "p", sessionId: "s1" });

    const stream = await sendPrompt("s1", "hello", undefined, "r2", "Kimi K3");
    const text = await new Response(stream).text();
    // No turn-start crash; the run flows (finally RUN_FINISHED), no RUN_ERROR.
    expect(text.includes("RUN_ERROR")).toBe(false);
    expect(text.includes("RUN_FINISHED")).toBe(true);
  });
});
