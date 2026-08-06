import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const {
  __resetSessionsForTests,
  __seedSessionForTests,
  getSessionPrompts,
  resolvePrompt,
} = await import("coding-agent/session-manager");
const { SessionEventLog } = await import("coding-agent/event-log");

/** Write a project prompt at <projectsRoot>/<project>/.agents/prompts/<name>/prompt.prompty */
function writePrompt(
  projectsRoot: string,
  project: string,
  name: string,
  body: string,
  inputs?: string,
): void {
  const dir = join(projectsRoot, project, ".agents", "prompts", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "prompt.prompty"),
    `---\nname: ${name}\ndescription: ${name}\n${inputs ?? ""}---\n\n${body}`,
  );
}
function seedSession(sessionId: string, project: string): void {
  __seedSessionForTests(sessionId, {
    sessionId,
    piSessionId: `pi-${sessionId}`,
    project,
    runtime: { session: {} } as never,
    eventLog: new SessionEventLog(),
  });
}

/**
 * The prompt catalog is keyed per project and resolved through the session →
 * project mapping in the worker's sessions map. Sessions in different
 * projects must never see each other's prompts, and a session rehydrated
 * after a worker restart (sessions map wiped, session reloaded from disk)
 * must still surface its project's prompts.
 */
describe("session-scoped prompt catalog", () => {
  let projectsRoot: string;
  let savedRoot: string | undefined;

  beforeEach(() => {
    __resetSessionsForTests();
    savedRoot = process.env.CODING_AGENT_PROJECTS_ROOT;
    projectsRoot = mkdtempSync(join(tmpdir(), "sm-prompts-"));
    process.env.CODING_AGENT_PROJECTS_ROOT = projectsRoot;
    writePrompt(projectsRoot, "p-a", "prompt-a", "body from A");
    writePrompt(projectsRoot, "p-b", "prompt-b", "body from B");
  });

  afterEach(() => {
    __resetSessionsForTests();
    rmSync(projectsRoot, { recursive: true, force: true });
    if (savedRoot === undefined) {
      delete process.env.CODING_AGENT_PROJECTS_ROOT;
    } else {
      process.env.CODING_AGENT_PROJECTS_ROOT = savedRoot;
    }
  });

  it("lists the prompts of the session's project only", () => {
    seedSession("s-a", "p-a");

    const names = getSessionPrompts("s-a").map((p) => p.name);

    expect(names).toContain("prompt-a");
    expect(names).not.toContain("prompt-b");
  });

  it("resolves prompt names against the session's project catalog", () => {
    // Same prompt name in both projects with different bodies — each session
    // must resolve its own project's version.
    writePrompt(projectsRoot, "p-a", "shared", "from A");
    writePrompt(projectsRoot, "p-b", "shared", "from B");
    seedSession("s-a", "p-a");
    seedSession("s-b", "p-b");

    expect(resolvePrompt("s-a", "shared", {}).text).toBe("from A");
    expect(resolvePrompt("s-b", "shared", {}).text).toBe("from B");
    // A prompt that only exists in project B must not resolve for session A.
    expect(() => resolvePrompt("s-a", "prompt-b", {})).toThrow(
      "Unknown prompt: prompt-b",
    );
  });

  it("keeps the project catalog available across a worker restart (reconnect)", () => {
    seedSession("s-a", "p-a");
    expect(getSessionPrompts("s-a").map((p) => p.name)).toContain("prompt-a");

    // Worker restart: the sessions map is wiped. Reconnecting the session
    // from disk (getOrCreateSession step 2 / loadSessionFromDisk) must not
    // leave the Prompts tab empty until a brand-new session is created.
    __resetSessionsForTests();
    seedSession("s-a", "p-a");

    expect(getSessionPrompts("s-a").map((p) => p.name)).toContain("prompt-a");
  });

  it("does not interpret $ patterns inside substituted values", () => {
    writePrompt(
      projectsRoot,
      "p-a",
      "greet",
      "Hello {{name}}!\n\n{{mood}}",
      [
        "inputs:",
        "  - name: name",
        "    kind: string",
        "    description: Person name",
        "    required: true",
        "  - name: mood",
        "    kind: string",
        "    description: Mood",
        "    enumValues: [happy, formal, casual]",
        "",
      ].join("\n"),
    );
    seedSession("s-a", "p-a");

    const result = resolvePrompt("s-a", "greet", {
      name: "A$&B",
      mood: "happy",
    });

    expect(result.text).toBe("Hello A$&B!\n\nhappy");
  });

  it("removes a line emptied by an unfilled optional input and preserves intentional blank lines", () => {
    writePrompt(
      projectsRoot,
      "p-b",
      "with-optional",
      "Hello {{name}}!\n{{extra_context}}\n\nDone.",
      [
        "inputs:",
        "  - name: name",
        "    kind: string",
        "    description: Person name",
        "    required: true",
        "  - name: extra_context",
        "    kind: string",
        "    description: Extra notes",
        "    required: false",
        "",
      ].join("\n"),
    );
    seedSession("s-b", "p-b");

    const result = resolvePrompt("s-b", "with-optional", { name: "Alice" });
    expect(result.text).toBe("Hello Alice!\n\nDone.");

    const filled = resolvePrompt("s-b", "with-optional", {
      name: "Alice",
      extra_context: "Be thorough",
    });
    expect(filled.text).toBe("Hello Alice!\nBe thorough\n\nDone.");
  });

  it("throws when the session is unknown", () => {
    expect(() => getSessionPrompts("missing")).toThrow("Session not found");
    expect(() => resolvePrompt("missing", "prompt-a", {})).toThrow(
      "Session not found",
    );
  });
});
