import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { SessionRegistry } from "../../src/session/session-registry";
import {
  findSessionFile,
  resolveSessionDir,
} from "../../src/session/session-file-lookup";

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

/**
 * The runtime itself needs models and extensions; these tests only exercise
 * the disk reload seam, so `createAgentSessionRuntime` hands back a session
 * view over the real `SessionManager` the registry just opened.
 */
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    createAgentSessionRuntime: async (
      _factory: unknown,
      options: {
        sessionManager: {
          getEntries: () => Array<{ type: string; message?: unknown }>;
        };
      },
    ) => ({
      session: {
        messages: options.sessionManager
          .getEntries()
          .filter((entry) => entry.type === "message")
          .map((entry) => entry.message),
        subscribe: () => () => {},
        dispose: () => {},
      },
    }),
  };
});

const fakeRuntimeFactory = (async () => ({})) as never;

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("findSessionFile", () => {
  let root: string;
  let scopePath: string;
  const savedAgentDir = process.env.PI_CODING_AGENT_DIR;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "session-file-lookup-"));
    process.env.PI_CODING_AGENT_DIR = path.join(root, "agent");
    scopePath = path.join(root, "sessions");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    restoreEnv("PI_CODING_AGENT_DIR", savedAgentDir);
  });

  it("resolves the transcript path inside the sessions directory", async () => {
    const name = "2026-01-02T03-04-05-678Z_s1.jsonl";
    const dir = resolveSessionDir(scopePath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, name), "");

    await expect(findSessionFile(scopePath, "s1")).resolves.toBe(path.join(dir, name));
  });

  it("returns undefined when the sessions directory does not exist", async () => {
    await expect(findSessionFile(scopePath, "s1")).resolves.toBeUndefined();
  });

  it("returns undefined when no transcript matches", async () => {
    mkdirSync(resolveSessionDir(scopePath), { recursive: true });

    await expect(findSessionFile(scopePath, "s1")).resolves.toBeUndefined();
  });
});

describe("SessionRegistry.loadSessionFromDisk", () => {
  let root: string;
  let sessionsDir: string;
  let registry: SessionRegistry;
  const savedAgentDir = process.env.PI_CODING_AGENT_DIR;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "session-disk-lookup-"));
    sessionsDir = path.join(root, "sessions");
    const projectsRoot = path.join(root, "projects");
    mkdirSync(path.join(projectsRoot, "demo"), { recursive: true });
    // El agente del SDK de Pi es su propia variable (PI_CODING_AGENT_DIR):
    // el lookup resuelve la codificación de transcripciones del SDK. NADA de
    // `CODING_AGENT_*`: rutas del worker por DI (ADR 0011 §6).
    process.env.PI_CODING_AGENT_DIR = path.join(root, "agent");
    registry = new SessionRegistry(fakeRuntimeFactory, { sessionsDir, projectsRoot });
  });

  afterEach(() => {
    registry.clear();
    rmSync(root, { recursive: true, force: true });
    restoreEnv("PI_CODING_AGENT_DIR", savedAgentDir);
  });

  /** Writes a real Pi transcript through the SDK into `dir` and returns its path. */
  function createTranscript(id: string, text: string, dir = sessionsDir): string {
    const manager = SessionManager.create(dir, undefined, { id });
    manager.appendMessage({
      role: "user",
      content: text,
      timestamp: Date.now(),
    } as never);
    // Pi defers the write until an assistant message lands.
    manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: `ack ${id}` }],
      api: "messages",
      provider: "model-gateway",
      model: "test-model",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: Date.now(),
    } as never);
    const file = manager.getSessionFile();
    expect(file).toBeDefined();
    return file!;
  }

  function messageTexts(entry: NonNullable<Awaited<ReturnType<SessionRegistry["loadSessionFromDisk"]>>>): string {
    const session = entry.runtime.session as unknown as { messages: unknown[] };
    return JSON.stringify(session.messages);
  }

  it("loads the requested transcript among other sessions", async () => {
    createTranscript("alpha", "hello from alpha");
    createTranscript("beta", "hello from beta");
    createTranscript("not-alpha", "hello from the decoy");

    const entry = await registry.loadSessionFromDisk("alpha", "demo");

    expect(entry).toBeDefined();
    expect(entry!.sessionId).toBe("alpha");
    const text = messageTexts(entry!);
    expect(text).toContain("hello from alpha");
    expect(text).not.toContain("hello from beta");
    expect(text).not.toContain("hello from the decoy");
  });

  it("returns undefined without registering anything when the session is not on disk", async () => {
    createTranscript("alpha", "hello from alpha");

    await expect(registry.loadSessionFromDisk("missing", "demo")).resolves.toBeUndefined();
    expect(registry.getRaw("missing")).toBeUndefined();
  });

  it("ignores unreadable foreign transcripts", async () => {
    createTranscript("alpha", "hello from alpha");
    const dir = resolveSessionDir(sessionsDir);
    writeFileSync(path.join(dir, "2026-01-01T00-00-00-000Z_corrupt.jsonl"), "not a pi session");
    writeFileSync(path.join(dir, "2026-01-01T00-00-00-000Z_truncated.jsonl"), "");

    const entry = await registry.loadSessionFromDisk("alpha", "demo");

    expect(entry?.sessionId).toBe("alpha");
    expect(messageTexts(entry!)).toContain("hello from alpha");
  });

  it("refuses a transcript whose header session id does not match", async () => {
    const dir = resolveSessionDir(sessionsDir);
    mkdirSync(dir, { recursive: true });
    const mismatched = path.join(dir, "2026-01-01T00-00-00-000Z_broken.jsonl");
    writeFileSync(
      mismatched,
      `${JSON.stringify({
        type: "session",
        version: 1,
        id: "some-other-session",
        timestamp: "2026-01-01T00:00:00.000Z",
        cwd: "/tmp",
      })}\n`,
    );

    await expect(registry.loadSessionFromDisk("broken", "demo")).resolves.toBeUndefined();
    expect(registry.getRaw("broken")).toBeUndefined();
  });

  it("loads subagent transcripts from the subagents session directory", async () => {
    const subagentsDir = path.join(sessionsDir, "subagents");
    createTranscript("subagent-1", "hello from the subagent", subagentsDir);

    const entry = await registry.loadSessionFromDisk("subagent-1", "demo", undefined, {
      sessionsSubdir: "subagents",
      parentSessionId: "parent",
    });

    expect(entry?.sessionId).toBe("subagent-1");
    expect(entry?.parentSessionId).toBe("parent");
    expect(messageTexts(entry!)).toContain("hello from the subagent");
  });
});
