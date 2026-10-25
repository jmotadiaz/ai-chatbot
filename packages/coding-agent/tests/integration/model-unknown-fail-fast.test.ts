import { mkdirSync, writeFileSync } from "node:fs";
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

const CATALOG_IDS = { "Kimi K3.1 Pro": true } as Record<string, boolean>;

const { SessionRegistry } = await import("../../src/session/session-registry");
const { TurnRunner } = await import("../../src/session/turn-runner");
const { createTestWorkerContext } = await import("../helpers/test-context");

/**
 * An unknown modelId must stop failing silently (Pi default / previous model
 * kept): session creation rejects with an explicit error and the turn fails
 * in-band with RUN_ERROR.
 *
 * ADR 0011 §6: paths and credentials through DI — an own registry + TurnRunner
 * with the `createTestWorkerContext()` sandbox. The test never touches
 * * the prod/dev runtime dirs nor mutates `process.env`.
 */
describe("unknown modelId fails explicitly", () => {
  let ctx: ReturnType<typeof createTestWorkerContext>;
  let registry: InstanceType<typeof SessionRegistry>;
  let runner: InstanceType<typeof TurnRunner>;
  const gateway: { gatewayUrl: string; apiKey: string } = {
    gatewayUrl: "http://127.0.0.1:4098",
    apiKey: "test-key",
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ models: [] })));
    ctx = createTestWorkerContext(gateway);
    registry = new SessionRegistry(undefined, ctx.workerConfig);
    runner = new TurnRunner(registry);
    // Pi resolves the transcript under <agentDir>/sessions/--<encoded>--; the
    // lookup tests pin the encoding, mirrored here for the reload path. The
    // SDK's own agent dir is stubbed to /tmp/agent-dir by the Pi mock above.
    const encoded = ctx.sessionsDir.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-");
    piState.sessionFilePath = join(ctx.agentDir, "sessions", `--${encoded}--`, "s1.jsonl");
    piState.getModelCalls = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    ctx.cleanup();
  });

  it("rejects getOrCreateSession with an unknown modelId on the create path", async () => {
    await expect(
      registry.getOrCreateSession({ userId: "u1", project: "p", modelId: "ghost-model" }),
    ).rejects.toThrow(/ghost-model/);
  });

  it("does not throw on the reload path with an unknown modelId (persisted obsolete model)", async () => {
    mkdirSync(dirname(piState.sessionFilePath), { recursive: true }); writeFileSync(piState.sessionFilePath, "");
    const result = await registry.getOrCreateSession({
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
    await registry.getOrCreateSession({ userId: "u1", project: "p", sessionId: "s1" });

    const stream = await runner.sendPrompt("s1", "hello", undefined, "r1", {
      modelId: "ghost-model",
    });
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
    await registry.getOrCreateSession({ userId: "u1", project: "p", sessionId: "s1" });

    const stream = await runner.sendPrompt("s1", "hello", undefined, "r2", {
      modelId: "Kimi K3.1 Pro",
    });
    const text = await new Response(stream).text();
    // No turn-start crash; the run flows (finally RUN_FINISHED), no RUN_ERROR.
    expect(text.includes("RUN_ERROR")).toBe(false);
    expect(text.includes("RUN_FINISHED")).toBe(true);
  });
});
