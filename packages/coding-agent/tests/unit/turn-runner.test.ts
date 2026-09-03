import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { inlineAttachedFiles } from "../../src/runtime/attached-files";
import { SessionEventLog } from "../../src/agui/event-log";
import { SessionRegistry } from "../../src/session/session-registry";
import { TurnRunner } from "../../src/session/turn-runner";
import { AguiEventType as EventType, type BaseEvent } from "../../src/agui/pi-to-agui-translator";
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

  it("emits exactly one terminal for a turn that fails, auto-retries, and fails again (regression: 'The run has already finished with RUN_FINISHED')", async () => {
    const promptImpl = async () => {
      mock.__emit({ type: "agent_start" });
      mock.__emit({
        type: "message_end",
        message: { role: "assistant", stopReason: "error", errorMessage: "429" },
      });
      mock.__emit({ type: "agent_end", willRetry: true, messages: [] });
      mock.__emit({
        type: "auto_retry_start",
        attempt: 1,
        maxAttempts: 3,
        delayMs: 1,
        errorMessage: "429",
      });
      mock.__emit({ type: "agent_start" });
      mock.__emit({
        type: "agent_end",
        willRetry: false,
        messages: [{ role: "assistant", stopReason: "error", errorMessage: "429" }],
      });
    };
    const mock = createMockPiSession({ messages: [], isStreaming: false, prompt: promptImpl });
    seed("s-retry", mock);

    const stream = await runner.sendPrompt("s-retry", "hello", undefined, "r-retry");
    await stream.cancel();

    const log = registry.getRaw("s-retry")!.eventLog!;
    await vi.waitFor(() => {
      const last = log.readAfter(0).at(-1)?.event.type;
      expect(last).toBe(EventType.RUN_ERROR);
    });

    const types = log.readAfter(0).map((l) => l.event.type);
    // One RUN_STARTED (no duplicate for the retry), the retry surfaced as a
    // non-terminal CUSTOM, and exactly one terminal for the whole turn.
    expect(types).toEqual([
      EventType.RUN_STARTED,
      EventType.MESSAGES_SNAPSHOT,
      EventType.CUSTOM,
      EventType.RUN_ERROR,
    ]);
  });

  describe("connectToSession", () => {
    async function readLines(stream: ReadableStream<Uint8Array>): Promise<Array<Record<string, unknown>>> {
      const reader = stream.getReader();
      const lines: Array<Record<string, unknown>> = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        lines.push(JSON.parse(new TextDecoder().decode(value)) as Record<string, unknown>);
      }
      return lines;
    }

    it("replays the prelude stamped with the cursor seq and the compacted tail, then closes idle", async () => {
      const mock = createMockPiSession({ messages: [], isStreaming: false });
      seed("c1", mock);
      const log = registry.getRaw("c1")!.eventLog!;
      log.append({ type: EventType.TOOL_CALL_START, toolCallId: "t1", toolCallName: "bash" } as BaseEvent);
      log.append({ type: EventType.TEXT_MESSAGE_CHUNK, messageId: "m1", delta: "hola " } as BaseEvent);
      log.append({ type: EventType.TEXT_MESSAGE_CHUNK, messageId: "m1", delta: "mundo" } as BaseEvent);

      const lines = await readLines(
        await runner.connectToSession("c1", { epoch: log.epoch, seq: 1 }),
      );

      // prelude first (synthetic re-open at the cursor), then the compacted tail.
      expect(lines.map((l) => l.event)).toMatchObject([
        { type: EventType.TOOL_CALL_START, toolCallId: "t1" },
        { type: EventType.TEXT_MESSAGE_CHUNK, messageId: "m1", delta: "hola mundo" },
      ]);
      expect(lines[0]!.seq).toBe(1); // cursor seq: prelude does not advance it
      expect(lines[1]!.seq).toBe(3); // last merged delta: cursor advances past it
      expect(lines[1]!.epoch).toBe(log.epoch);
    });

    it("applies the terminal-close policy once: a live RUN_FINISHED closes the stream", async () => {
      const mock = createMockPiSession({ messages: [], isStreaming: true });
      seed("c2", mock);
      const log = registry.getRaw("c2")!.eventLog!;

      const stream = await runner.connectToSession("c2", { epoch: log.epoch, seq: 0 });
      // start() runs synchronously during construction: the subscription is
      // live by the time connectToSession resolves.
      log.append({
        type: EventType.RUN_FINISHED,
        threadId: "c2",
        runId: "r9",
        timestamp: Date.now(),
      } as BaseEvent);

      const reader = stream.getReader();
      const first = await reader.read();
      expect(first.done).toBe(false);
      const line = JSON.parse(new TextDecoder().decode(first.value)) as { event: { type: string } };
      expect(line.event.type).toBe(EventType.RUN_FINISHED);

      expect(await reader.read()).toEqual({ done: true, value: undefined });
      expect((log as unknown as { subscribers: Set<unknown> }).subscribers.size).toBe(0);
    });

    it("unsubscribes when the client cancels the stream", async () => {
      const mock = createMockPiSession({ messages: [], isStreaming: true });
      seed("c3", mock);
      const log = registry.getRaw("c3")!.eventLog!;

      const stream = await runner.connectToSession("c3", { epoch: log.epoch, seq: 0 });
      const reader = stream.getReader();
      const pending = reader.read();

      await reader.cancel();

      expect(await pending).toEqual({ done: true, value: undefined });
      expect((log as unknown as { subscribers: Set<unknown> }).subscribers.size).toBe(0);
    });

    it("fails closed for subagent sessions without the matching parent session id", async () => {
      const mock = createMockPiSession({ messages: [], isStreaming: false });
      registry.set("sub1", {
        sessionId: "sub1",
        project: "p",
        parentSessionId: "parent-1",
        runtime: { session: mock.session } as never,
        eventLog: new SessionEventLog(),
      });
      const log = registry.getRaw("sub1")!.eventLog!;

      // Wrong (missing) parent: the stream errors, connectToSession itself does not throw.
      const denied = await runner.connectToSession("sub1", { epoch: log.epoch, seq: 0 });
      await expect(denied.getReader().read()).rejects.toThrow(
        "Subagent session requires valid parent session id",
      );

      // Matching parent: connects and closes idle.
      const allowed = await runner.connectToSession("sub1", { epoch: log.epoch, seq: 0 }, "parent-1");
      expect(await readLines(allowed)).toEqual([]);
    });

    it("surfaces a stale epoch as a stream error, preserving the client-visible semantics", async () => {
      const mock = createMockPiSession({ messages: [], isStreaming: false });
      seed("c4", mock);

      const stream = await runner.connectToSession("c4", { epoch: "stale-epoch", seq: 0 });
      await expect(stream.getReader().read()).rejects.toThrow("Cursor epoch mismatch");
    });

    it("closes quietly when the session does not exist", async () => {
      const stream = await runner.connectToSession("missing", { epoch: "e", seq: 0 });
      expect(await stream.getReader().read()).toEqual({ done: true, value: undefined });
    });
  });

describe("TurnRunner followUp (ticket 01)", () => {
  function seedRunning(sessionId: string, mock: ReturnType<typeof createMockPiSession>) {
    seed(sessionId, mock);
    (mock.session as any).isStreaming = true;
    (mock.session as any).followUp = vi.fn(async () => {});
    (mock.session as any).getSteeringMessages = () => [];
    (mock.session as any).getFollowUpMessages = () => [];
    registry.getRaw(sessionId)!.activeRun = {
      runId: "r-fu",
      startSeq: 1,
      unsubscribe: () => {},
      sawTerminal: false,
    };
  }

  it("queues plain text on the live session and reports the pending queue", async () => {
    const mock = createMockPiSession({ messages: [], isStreaming: false });
    seedRunning("fu-ok", mock);
    (mock.session as any).getFollowUpMessages = () => ["also fix the typo"];

    const result = await runner.followUp("fu-ok", "also fix the typo");

    expect(mock.session.followUp).toHaveBeenCalledWith("also fix the typo");
    expect(result).toEqual({
      queued: true,
      pending: { steering: [], followUp: ["also fix the typo"] },
    });
  });

  it("rejects empty text, commands and idle sessions without touching Pi", async () => {
    const mock = createMockPiSession({ messages: [], isStreaming: false });
    seedRunning("fu-bad", mock);

    await expect(runner.followUp("fu-bad", "   ")).rejects.toThrow("non-empty");
    await expect(runner.followUp("fu-bad", "/compact")).rejects.toThrow("plain text");
    await expect(runner.followUp("missing", "hi")).rejects.toThrow("Session not found");
    expect(mock.session.followUp).not.toHaveBeenCalled();

    registry.getRaw("fu-bad")!.activeRun = undefined;
    (mock.session as any).isStreaming = false;
    await expect(runner.followUp("fu-bad", "hi")).rejects.toThrow("no turn is running");
    expect(mock.session.followUp).not.toHaveBeenCalled();
  });

  it("surfaces a delivered queued message inside the active turn, without opening a new run", async () => {
    const promptImpl = async () => {
      mock.__emit({ type: "agent_start" });
      // The turn prompt itself: stamped, never re-emitted.
      mock.__emit({ type: "message_end", message: { role: "user", timestamp: 1000 } });
      // The queued follow-up delivered at end-of-turn.
      mock.__emit({
        type: "message_start",
        message: { role: "user", content: [{ type: "text", text: "also fix the typo" }] },
      });
      mock.__emit({
        type: "message_end",
        message: {
          role: "user",
          timestamp: 2000,
          content: [{ type: "text", text: "also fix the typo" }],
        },
      });
      mock.__emit({ type: "agent_end", willRetry: false, messages: [] });
    };
    const mock = createMockPiSession({ messages: [], isStreaming: false, prompt: promptImpl });
    seed("fu-turn", mock);

    const stream = await runner.sendPrompt("fu-turn", "do the thing", undefined, "r-fu-turn");
    await stream.cancel();

    const log = registry.getRaw("fu-turn")!.eventLog!;
    await vi.waitFor(() => {
      expect(log.readAfter(0).at(-1)?.event.type).toBe(EventType.RUN_FINISHED);
    });

    const events = log.readAfter(0).map((l) => l.event);
    // Same run identity throughout: exactly one RUN_STARTED, one terminal.
    expect(events.filter((e) => e.type === EventType.RUN_STARTED)).toHaveLength(1);
    expect(
      events.filter((e) => e.type === EventType.RUN_FINISHED || e.type === EventType.RUN_ERROR),
    ).toHaveLength(1);

    const triplet = events.filter(
      (e) =>
        e.type === EventType.TEXT_MESSAGE_START ||
        e.type === EventType.TEXT_MESSAGE_CONTENT ||
        e.type === EventType.TEXT_MESSAGE_END,
    );
    expect(triplet.map((e) => e.type)).toEqual([
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
    ]);
    expect(triplet[0]).toMatchObject({ messageId: "u-2000", role: "user" });
    expect(triplet[1]).toMatchObject({ messageId: "u-2000", delta: "also fix the typo" });
    expect(triplet[2]).toMatchObject({ messageId: "u-2000" });
    // The turn prompt itself is only in the opening snapshot, never re-emitted.
    expect(events.filter((e) => (e as { messageId?: string }).messageId === "u-1000")).toHaveLength(0);
  });

  it("re-emits Pi queue updates as CUSTOM events for the chip", async () => {
    const promptImpl = async () => {
      mock.__emit({ type: "agent_start" });
      mock.__emit({ type: "queue_update", steering: [], followUp: ["also fix the typo"] });
      mock.__emit({ type: "agent_end", willRetry: false, messages: [] });
    };
    const mock = createMockPiSession({ messages: [], isStreaming: false, prompt: promptImpl });
    seed("fu-queue", mock);

    const stream = await runner.sendPrompt("fu-queue", "do the thing", undefined, "r-fu-queue");
    await stream.cancel();

    const log = registry.getRaw("fu-queue")!.eventLog!;
    await vi.waitFor(() => {
      expect(log.readAfter(0).at(-1)?.event.type).toBe(EventType.RUN_FINISHED);
    });
    const customs = log
      .readAfter(0)
      .map((l) => l.event)
      .filter((e) => e.type === EventType.CUSTOM);
    expect(customs).toContainEqual(
      expect.objectContaining({
        name: "coding_agent_queue_update",
        value: { steering: [], followUp: ["also fix the typo"] },
      }),
    );
  });
});
});
