import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { inlineAttachedFiles } from "../../src/attached-files";
import { SessionEventLog } from "../../src/event-log";
import { SessionRegistry } from "../../src/session-registry";
import { TurnRunner } from "../../src/turn-runner";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

type Event = { type: string; [k: string]: unknown };
type Listener = (event: Event) => void;

function createMockPiSession(opts: {
  messages?: Array<unknown>;
  isStreaming?: boolean;
  prompt?: (text: string, options?: unknown) => Promise<void>;
  thinkingLevel?: string;
  model?: { provider: string; id: string };
}) {
  const listeners = new Set<Listener>();
  const promptCalls: Array<{ text: string; options: unknown }> = [];
  const subscribe = vi.fn((cb: Listener) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  });
  const session: any = {
    messages: opts.messages ?? [],
    isStreaming: opts.isStreaming ?? false,
    thinkingLevel: opts.thinkingLevel ?? "off",
    model: opts.model,
    getAvailableThinkingLevels: () => ["off", "high", "xhigh"],
    setThinkingLevel: vi.fn((lvl: string) => {
      session.thinkingLevel = lvl;
    }),
    setModel: vi.fn(async (m: any) => {
      session.model = { provider: m.provider, id: m.id };
    }),
    subscribe,
    prompt: vi.fn((text: string, options?: unknown) => {
      promptCalls.push({ text, options });
      return (opts.prompt ?? (() => Promise.resolve()))(text, options);
    }),
    resourceLoader: { getSkills: () => ({ skills: [] }), getExtensions: () => ({ extensions: [] }), getAppendSystemPrompt: () => [] },
    systemPrompt: "",
  };
  return {
    session,
    __emit(event: Event) {
      for (const l of listeners) l(event);
    },
    promptCalls,
  };
}

const docBase64 = (content: string) => Buffer.from(content, "utf8").toString("base64");

describe("TurnRunner (deep module)", () => {
  let registry: SessionRegistry;
  let runner: TurnRunner;
  let savedRoot: string | undefined;
  let projectsRoot: string;

  beforeEach(() => {
    registry = new SessionRegistry();
    runner = new TurnRunner(registry);
    savedRoot = process.env.CODING_AGENT_PROJECTS_ROOT;
    projectsRoot = mkdtempSync(join(tmpdir(), "turn-runner-"));
    process.env.CODING_AGENT_PROJECTS_ROOT = projectsRoot;
  });

  afterEach(() => {
    if (savedRoot === undefined) delete process.env.CODING_AGENT_PROJECTS_ROOT;
    else process.env.CODING_AGENT_PROJECTS_ROOT = savedRoot;
    rmSync(projectsRoot, { recursive: true, force: true });
  });

  function seed(sessionId: string, mock: ReturnType<typeof createMockPiSession>) {
    registry.set(sessionId, {
      sessionId,
      project: "p",
      runtime: { session: mock.session } as never,
      eventLog: new SessionEventLog(),
    });
  }

  it("inlines a text-file attachment into the prompt and calls Pi with no images option", async () => {
    const mock = createMockPiSession({ messages: [], isStreaming: false });
    seed("s1", mock);

    const stream = await runner.sendPrompt(
      "s1",
      "fallback prompt",
      [
        {
          id: "u1",
          role: "user",
          content: [
            { type: "text", text: "check this" },
            {
              type: "document",
              source: { type: "data", value: docBase64("file body"), mimeType: "text/plain" },
              metadata: { filename: "doc.txt" },
            },
          ],
        },
      ],
      "r1",
    );
    await stream.cancel();

    expect(mock.promptCalls).toHaveLength(1);
    const [call] = mock.promptCalls;
    expect(call!.text).toBe(
      inlineAttachedFiles("check this", [{ filename: "doc.txt", mimeType: "text/plain", content: "file body" }]),
    );
    expect(call!.options).toBeUndefined();
  });

  it("passes images through PromptOptions.images and leaves the prompt text untouched", async () => {
    const mock = createMockPiSession({ messages: [], isStreaming: false });
    seed("s2", mock);

    const stream = await runner.sendPrompt(
      "s2",
      "fallback",
      [
        {
          id: "u1",
          role: "user",
          content: [
            { type: "text", text: "look" },
            { type: "image", source: { type: "data", value: docBase64("img"), mimeType: "image/png" } },
          ],
        },
      ],
      "r2",
    );
    await stream.cancel();

    expect(mock.promptCalls).toHaveLength(1);
    expect(mock.promptCalls[0]!.options).toEqual({
      images: [{ type: "image", data: docBase64("img"), mimeType: "image/png" }],
    });
  });

  it("applies thinkingLevel as turn config only if different, without extra setModel when same model", async () => {
    const mock = createMockPiSession({
      thinkingLevel: "off",
      model: { provider: "opencode-go", id: "deepseek-v4-pro" },
    });
    seed("s3", mock);
    // Mock services modelRegistry for TurnRunner setModel path (not needed here since model same)
    (mock.session as any).model = { provider: "opencode-go", id: "deepseek-v4-pro" };
    // Inject services so find returns model (for potential model switch)
    (registry.getRaw("s3") as any).runtime.services = {
      modelRegistry: { find: () => ({ provider: "opencode-go", id: "deepseek-v4-pro" }) },
    };

    const stream = await runner.sendPrompt("s3", "hello", undefined, "r3", {
      modelId: "opencode-go/deepseek-v4-pro",
      thinkingLevel: "high",
    } as any);
    await stream.cancel();

    expect(mock.session.setThinkingLevel).toHaveBeenCalledWith("high");
    expect(mock.session.setModel).not.toHaveBeenCalled();
  });

  it("rejects model change while streaming", async () => {
    const mock = createMockPiSession({
      isStreaming: true,
      model: { provider: "opencode-go", id: "flash" },
    });
    seed("s4", mock);
    (registry.getRaw("s4") as any).runtime.services = {
      modelRegistry: { find: () => ({ provider: "opencode-go", id: "pro" }) },
    };

    await expect(
      runner.sendPrompt("s4", "hello", undefined, "r4", { modelId: "opencode-go/pro" } as any),
    ).rejects.toThrow("Cannot change model while the agent is running");
  });

  it("expands leading skill commands preserving order", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "turn-skills-"));
    const { writeFileSync } = await import("node:fs");
    const firstPath = join(baseDir, "a.md");
    const secondPath = join(baseDir, "b.md");
    writeFileSync(firstPath, "---\nname: a\ndescription: A\n---\nA instr");
    writeFileSync(secondPath, "---\nname: b\ndescription: B\n---\nB instr");
    const skills = [
      { name: "a", description: "A", filePath: firstPath, baseDir },
      { name: "b", description: "B", filePath: secondPath, baseDir },
    ];
    const mock = createMockPiSession({ isStreaming: false });
    mock.session.resourceLoader = { getSkills: () => ({ skills }), getExtensions: () => ({ extensions: [] }), getAppendSystemPrompt: () => [] } as any;
    seed("s5", mock);

    const stream = await runner.sendPrompt("s5", "/skill:a /skill:b\n\nhello", [{ id: "u1", role: "user", content: "/skill:a /skill:b\n\nhello" } as any], "r5");
    await stream.cancel();

    const expanded = mock.promptCalls[0]!.text as string;
    expect(expanded).toContain('<skill name="a"');
    expect(expanded).toContain('<skill name="b"');
    expect(expanded.indexOf('name="a"')).toBeLessThan(expanded.indexOf('name="b"'));
  });
});
