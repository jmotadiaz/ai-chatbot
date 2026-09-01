import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionEventLog } from "../../src/event-log";
import { SessionRegistry } from "../../src/session-registry";
import { SessionQueries } from "../../src/session-queries";

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

function makeSession(skills: Array<{ name: string; description: string; filePath?: string; baseDir?: string }> = []) {
  return {
    messages: [],
    isStreaming: false,
    thinkingLevel: "high",
    getAvailableThinkingLevels: () => ["off", "high", "xhigh"],
    setThinkingLevel: vi.fn(),
    resourceLoader: { getSkills: () => ({ skills }), getExtensions: () => ({ extensions: [] }), getAppendSystemPrompt: () => [] },
    systemPrompt: "",
    model: { provider: "opencode-go", id: "model-a" },
  };
}

describe("SessionQueries (deep module)", () => {
  let registry: SessionRegistry;
  let queries: SessionQueries;
  let projectsRoot: string;
  let savedRoot: string | undefined;

  beforeEach(() => {
    registry = new SessionRegistry();
    queries = new SessionQueries(registry);
    savedRoot = process.env.CODING_AGENT_PROJECTS_ROOT;
    projectsRoot = mkdtempSync(join(tmpdir(), "sq-"));
    process.env.CODING_AGENT_PROJECTS_ROOT = projectsRoot;
  });

  afterEach(() => {
    rmSync(projectsRoot, { recursive: true, force: true });
    if (savedRoot === undefined) delete process.env.CODING_AGENT_PROJECTS_ROOT;
    else process.env.CODING_AGENT_PROJECTS_ROOT = savedRoot;
  });

  function seed(sessionId: string, project: string, session: unknown) {
    registry.set(sessionId, {
      sessionId,
      project,
      runtime: { session } as never,
      eventLog: new SessionEventLog(),
    });
  }

  it("returns session skills as sorted UI-safe metadata", () => {
    seed("s1", "p", makeSession([
      { name: "b", description: "B" },
      { name: "a", description: "A" },
    ]));
    const skills = queries.getSessionSkills("s1");
    expect(skills).toEqual([
      { name: "a", description: "A" },
      { name: "b", description: "B" },
    ]);
  });

  it("lists prompts of the session's project only", () => {
    const promptsDirA = join(projectsRoot, "p-a", ".agents", "prompts");
    const promptsDirB = join(projectsRoot, "p-b", ".agents", "prompts");
    mkdirSync(promptsDirA, { recursive: true });
    mkdirSync(promptsDirB, { recursive: true });
    writeFileSync(join(promptsDirA, "prompt-a.prompty"), "---\nname: prompt-a\ndescription: a\n---\n\nbody A");
    writeFileSync(join(promptsDirB, "prompt-b.prompty"), "---\nname: prompt-b\ndescription: b\n---\n\nbody B");

    seed("s-a", "p-a", makeSession());
    const names = queries.getSessionPrompts("s-a").map((p) => p.name);
    expect(names).toContain("prompt-a");
    expect(names).not.toContain("prompt-b");
  });

  it("resolves prompt names against the session's project catalog", () => {
    const dirA = join(projectsRoot, "p-a", ".agents", "prompts");
    const dirB = join(projectsRoot, "p-b", ".agents", "prompts");
    mkdirSync(dirA, { recursive: true });
    mkdirSync(dirB, { recursive: true });
    writeFileSync(join(dirA, "shared.prompty"), "---\nname: shared\ndescription: s\n---\n\nfrom A");
    writeFileSync(join(dirB, "shared.prompty"), "---\nname: shared\ndescription: s\n---\n\nfrom B");

    seed("s-a", "p-a", makeSession());
    seed("s-b", "p-b", makeSession());

    expect(queries.resolvePrompt("s-a", "shared", {}).text).toBe("from A");
    expect(queries.resolvePrompt("s-b", "shared", {}).text).toBe("from B");
  });

  it("returns session messages via agui conversion (history path)", async () => {
    const session = {
      messages: [{ role: "user", content: "hello", timestamp: 123 }],
      isStreaming: false,
    };
    seed("s1", "p", session);
    const msgs = await queries.getSessionMessages("s1");
    expect(msgs[0]).toMatchObject({ role: "user" });
  });

  it("throws when accessing subagent message without parent guard", async () => {
    registry.set("child-1", {
      sessionId: "child-1",
      project: "p",
      parentSessionId: "parent-1",
      runtime: { session: makeSession() } as never,
      eventLog: new SessionEventLog(),
    });
    await expect(queries.getSessionMessages("child-1")).rejects.toThrow("Subagent session requires valid parent session id");
    await expect(queries.getSessionMessages("child-1", undefined, "parent-1")).resolves.toBeDefined();
  });

  it("returns model and thinking level as read models", async () => {
    const session = {
      thinkingLevel: "high",
      getAvailableThinkingLevels: () => ["off", "high"],
      model: { provider: "opencode-go", id: "model-a" },
      isStreaming: false,
      messages: [],
    };
    seed("s1", "p", session);
    expect(await queries.getSessionModel("s1")).toEqual({ providerId: "opencode-go", modelId: "model-a" });
    expect(await queries.getSessionThinkingLevel("s1")).toEqual({ level: "high", levels: ["off", "high"] });
  });
});
