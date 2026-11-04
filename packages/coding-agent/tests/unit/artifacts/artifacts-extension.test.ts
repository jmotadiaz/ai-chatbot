import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  acquireTraceSink: async () => null,
  releaseTraceSink: async () => {},
  setTraceSessionId: () => {},
  runWithTraceContext: (_ctx: unknown, fn: () => Promise<unknown>) => fn(),
  getTraceLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    startTimer: () => () => {},
  }),
}));

const registerExtension = (await import("../../../extensions/artifacts/index")).default;
const { setWorkerRuntimeConfig, resetWorkerRuntimeConfigForTests } = await import(
  "../../../src/runtime/runtime-overrides"
);

/**
 * The artifacts extension's public boundary: the tool the model calls, the
 * `/artifacts` command the user runs, and the absence of any implicit publish.
 *
 * ADR 0011 §6: the artifacts root is injected as process config (the same one
 * the transport's composition root registers), never by mutating `process.env`.
 */

const SESSION_ID = "session-under-test";
const CWD = "/home/javier/projects/ai-chatbot";
const REPORT =
  "<!doctype html><html><head><title>Architecture review — Coding Agent</title>" +
  "</head><body></body></html>";

let tmp: string;
let rootDir: string;

beforeAll(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "artifacts-extension-"));
  rootDir = path.join(tmp, "root");
  await mkdir(path.join(tmp, "generated"), { recursive: true });
  setWorkerRuntimeConfig({ artifactsDir: rootDir });
});

beforeEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

afterAll(async () => {
  resetWorkerRuntimeConfigForTests();
  await rm(tmp, { recursive: true, force: true });
});

interface ToolContext {
  cwd: string;
  sessionManager: { getSessionId(): string };
}

interface RegisteredTool {
  name: string;
  description: string;
  promptGuidelines?: string[];
  parameters: unknown;
  execute: (
    toolCallId: string,
    params: { path: string; name: string },
    signal: AbortSignal | undefined,
    onUpdate: undefined,
    ctx: ToolContext,
  ) => Promise<{
    content: Array<{ type: string; text: string }>;
    details?: unknown;
    isError?: boolean;
  }>;
}

interface RegisteredCommand {
  description: string;
  handler: (args: string, ctx: unknown) => Promise<void>;
}

function load() {
  const tools: RegisteredTool[] = [];
  const commands = new Map<string, RegisteredCommand>();
  const hooks: string[] = [];
  registerExtension({
    registerTool: (tool: RegisteredTool) => tools.push(tool),
    on: (event: string) => hooks.push(event),
    registerCommand: (name: string, command: RegisteredCommand) => commands.set(name, command),
  } as never);
  return { tools, commands, hooks };
}

function toolContext(cwd = CWD): ToolContext {
  return { cwd, sessionManager: { getSessionId: () => SESSION_ID } };
}

async function htmlFile(name: string, content = REPORT): Promise<string> {
  const file = path.join(tmp, "generated", name);
  await writeFile(file, content, "utf-8");
  return file;
}

async function runTool(params: { path: string; name: string }, cwd = CWD) {
  const { tools } = load();
  return tools[0]!.execute("call-1", params, undefined, undefined, toolContext(cwd));
}

describe("publish_artifact tool registration", () => {
  it("registers only publish_artifact and the /artifacts command", () => {
    const { tools, commands, hooks } = load();
    expect(tools.map((t) => t.name)).toEqual(["publish_artifact"]);
    expect([...commands.keys()]).toEqual(["artifacts"]);
    expect(hooks).toEqual([]);
  });

  it("takes exactly { path, name }, with no title parameter", () => {
    const { tools } = load();
    const schema = tools[0]!.parameters as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties).sort()).toEqual(["name", "path"]);
  });

  it("tells the model to publish instead of opening a browser", () => {
    const { tools } = load();
    const tool = tools[0]!;
    expect(tool.description).toContain("xdg-open");
    expect(tool.promptGuidelines?.join(" ")).toMatch(/xdg-open/);
    expect(tool.promptGuidelines?.join(" ")).toMatch(/publish_artifact\(\{ path, name \}\)/);
  });
});

describe("publish_artifact tool execution", () => {
  it("publishes an HTML file under <project>/<name>/index.html and returns the Chatbot view path", async () => {
    const file = await htmlFile("review-1.html");

    const result = await runTool({ path: file, name: "review-1" });

    expect(result.isError).toBeUndefined();
    const expectedFile = path.join(rootDir, "ai-chatbot", "review-1", "index.html");
    expect(await readFile(expectedFile, "utf-8")).toBe(REPORT);
    expect(result.content[0]!.text).toContain(
      `URL: /agent/code/ai-chatbot/${SESSION_ID}/artifacts/review-1`,
    );
    expect(result.content[0]!.text).toContain("Architecture review — Coding Agent");
    expect(result.content[0]!.text).not.toMatch(/https?:\/\//);
  });

  it("publishes a folder that contains index.html", async () => {
    const dir = path.join(tmp, "generated", "bundle");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), REPORT, "utf-8");

    const result = await runTool({ path: dir, name: "bundle-view" });

    expect(result.isError).toBeUndefined();
    expect(existsSync(path.join(rootDir, "ai-chatbot", "bundle-view", "index.html"))).toBe(true);
  });

  it("overwrites the artifact in place when the same name is published again", async () => {
    const file = await htmlFile("review-2.html");
    await runTool({ path: file, name: "review-2" });

    await writeFile(file, REPORT.replace("Architecture review", "Revised review"), "utf-8");
    const second = await runTool({ path: file, name: "review-2" });

    expect(second.content[0]!.text).toContain(
      `URL: /agent/code/ai-chatbot/${SESSION_ID}/artifacts/review-2`,
    );
    expect(await readFile(path.join(rootDir, "ai-chatbot", "review-2", "index.html"), "utf-8")).toContain(
      "Revised review",
    );
    expect(existsSync(path.join(rootDir, "ai-chatbot", "review-2-"))).toBe(false);
  });

  it("answers a missing path with an error result instead of throwing", async () => {
    const result = await runTool({
      path: path.join(tmp, "generated", "absent.html"),
      name: "absent",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/Could not publish .* as "absent"/);
    expect(result.content[0]!.text).toMatch(/Artifact path not found/);
  });

  it("rejects a non-HTML file with an error result", async () => {
    const file = path.join(tmp, "generated", "data.csv");
    await writeFile(file, "a,b\n", "utf-8");
    const result = await runTool({ path: file, name: "data" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/must be an \.html\/\.htm file/);
  });

  it("rejects an unsafe name with an error result and writes nothing", async () => {
    const file = await htmlFile("review-3.html");
    const result = await runTool({ path: file, name: "../escape" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/Invalid artifact name/);
    expect(existsSync(rootDir)).toBe(false);
  });
});

describe("no implicit publishing", () => {
  it("registers no tool_result hook, so writes to the temp dir never publish on their own", async () => {
    // The old hook appended a URL to any `write` under os.tmpdir(). Only the
    // explicit publish_artifact call publishes now.
    const { hooks } = load();
    expect(hooks).toEqual([]);

    await htmlFile("implicit.html");
    expect(existsSync(path.join(rootDir, "ai-chatbot", "implicit"))).toBe(false);
  });
});

describe("/artifacts command", () => {
  it("says so when nothing has been published", async () => {
    const { commands } = load();
    const notes: string[] = [];
    await commands.get("artifacts")!.handler("", {
      sessionManager: { getSessionId: () => SESSION_ID },
      ui: { notify: (message: string) => notes.push(message) },
    });
    expect(notes).toEqual(["No published artifacts yet"]);
  });

  it("lists published artifacts with Chatbot view paths for the current session", async () => {
    await runTool({ path: await htmlFile("listed.html"), name: "listed" });
    const { commands } = load();
    const notes: string[] = [];

    await commands.get("artifacts")!.handler("", {
      sessionManager: { getSessionId: () => SESSION_ID },
      ui: { notify: (message: string) => notes.push(message) },
    });

    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("Architecture review — Coding Agent");
    expect(notes[0]).toContain(`/agent/code/ai-chatbot/${SESSION_ID}/artifacts/listed`);
    expect(notes[0]).not.toMatch(/https?:\/\//);
  });
});
