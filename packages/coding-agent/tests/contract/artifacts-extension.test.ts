import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

const registerExtension = (await import("../../extensions/artifacts/index")).default;
const { getArtifactsDir } = await import("../../src/paths");

/**
 * The artifacts extension's public boundary: the tool name and description the
 * model sees, and the automatic publish that keeps vendored skills working
 * without editing them.
 */

let tmp: string;

beforeAll(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "artifacts-extension-"));
  await mkdir(path.join(tmp, "root"), { recursive: true });
  await mkdir(path.join(tmp, "generated"), { recursive: true });
  vi.stubEnv("CODING_AGENT_ARTIFACTS_DIR", path.join(tmp, "root"));
  vi.stubEnv("CODING_AGENT_ARTIFACTS_URL", "http://artifacts.test");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await rm(tmp, { recursive: true, force: true });
});

interface RegisteredTool {
  name: string;
  description: string;
  promptGuidelines?: string[];
  execute: (
    toolCallId: string,
    params: { path: string; title?: string },
    signal: AbortSignal | undefined,
    onUpdate: undefined,
    ctx: { cwd: string },
  ) => Promise<{
    content: Array<{ type: string; text: string }>;
    details?: unknown;
    isError?: boolean;
  }>;
}

type ToolResultHandler = (
  event: {
    type: "tool_result";
    toolCallId: string;
    toolName: string;
    input: Record<string, unknown>;
    content: Array<{ type: "text"; text: string }>;
    isError: boolean;
    details: unknown;
  },
  ctx: { cwd: string },
) => Promise<{ content?: Array<{ type: string; text: string }> } | undefined>;

function load() {
  const tools: RegisteredTool[] = [];
  const handlers = new Map<string, ToolResultHandler[]>();
  const commands: string[] = [];
  registerExtension({
    registerTool: (tool: RegisteredTool) => tools.push(tool),
    on: (event: string, handler: ToolResultHandler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerCommand: (name: string) => commands.push(name),
  } as never);
  return { tools, handlers, commands };
}

async function report(name: string): Promise<string> {
  const file = path.join(tmp, "generated", name);
  await writeFile(
    file,
    "<!doctype html><html><head><title>Architecture review — Coding Agent</title>" +
      "</head><body></body></html>",
    "utf-8",
  );
  return file;
}

describe("publish_artifact tool", () => {
  it("registers publish_artifact and the /artifacts command", () => {
    const { tools, commands } = load();
    expect(tools.map((t) => t.name)).toEqual(["publish_artifact"]);
    expect(commands).toEqual(["artifacts"]);
  });

  it("tells the model to publish instead of opening a browser", () => {
    const { tools } = load();
    const tool = tools[0]!;
    expect(tool.description).toContain("browser");
    expect(tool.promptGuidelines?.join(" ")).toMatch(/xdg-open/);
  });

  it("returns the URL the user should be shown", async () => {
    const { tools } = load();
    const file = await report("review-1.html");

    const result = await tools[0]!.execute(
      "call-1",
      { path: file },
      undefined,
      undefined,
      { cwd: "/home/javier/projects/ai-chatbot" },
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toContain(
      "http://artifacts.test/artifacts/ai-chatbot/review-1.html",
    );
    expect(result.content[0]!.text).toContain("Architecture review — Coding Agent");
    expect(getArtifactsDir()).toBe(path.join(tmp, "root"));
  });

  it("answers a missing file with a readable error instead of throwing", async () => {
    const { tools } = load();
    const result = await tools[0]!.execute(
      "call-2",
      { path: path.join(tmp, "generated", "absent.html") },
      undefined,
      undefined,
      { cwd: tmp },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/Could not publish/);
  });
});

describe("automatic publish of temp-dir reports", () => {
  async function runWrite(resultHandler: ToolResultHandler, filePath: string) {
    return resultHandler(
      {
        type: "tool_result",
        toolCallId: "call-3",
        toolName: "write",
        input: { path: filePath, content: "x" },
        content: [{ type: "text", text: "wrote 42 bytes" }],
        isError: false,
        details: undefined,
      },
      { cwd: "/home/javier/projects/ai-chatbot" },
    );
  }

  it("appends the URL to the write result of a report in the temp dir", async () => {
    const { handlers } = load();
    const handler = handlers.get("tool_result")![0]!;
    const file = await report("review-2.html");

    const patched = await runWrite(handler, file);

    expect(patched?.content?.map((c) => c.text).join("")).toContain(
      "http://artifacts.test/artifacts/ai-chatbot/review-2.html",
    );
    expect(patched?.content?.[0]?.text).toBe("wrote 42 bytes"); // original kept
    expect(
      await readFile(path.join(tmp, "root", "ai-chatbot", "review-2.html"), "utf-8"),
    ).toContain("Architecture review");
  });

  it("publishes a rewritten report under a new URL instead of hiding the change", async () => {
    const { handlers } = load();
    const handler = handlers.get("tool_result")![0]!;
    const file = await report("review-4.html");
    const first = await runWrite(handler, file);

    await writeFile(file, "<!doctype html><html><head><title>Revised review</title></head></html>");
    const second = await runWrite(handler, file);

    const firstUrl = first?.content?.at(-1)?.text ?? "";
    const secondUrl = second?.content?.at(-1)?.text ?? "";
    expect(secondUrl).not.toBe(firstUrl);
    expect(secondUrl).toMatch(/review-4-[0-9a-f]{8}\.html/);
  });

  it("leaves repository files and non-reports alone", async () => {
    const { handlers } = load();
    const handler = handlers.get("tool_result")![0]!;

    expect(await runWrite(handler, "/repo/packages/chatbot/app/page.html")).toBeUndefined();
    expect(await runWrite(handler, path.join(tmp, "generated", "notes.txt"))).toBeUndefined();
  });

  it("stays silent when publishing fails", async () => {
    const { handlers } = load();
    const handler = handlers.get("tool_result")![0]!;
    const missing = path.join(os.tmpdir(), `gone-${Date.now()}.html`);
    expect(await runWrite(handler, missing)).toBeUndefined();
  });
});
