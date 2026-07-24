import { describe, it, expect, vi, beforeEach } from "vitest";
import { inlineAttachedFiles } from "coding-agent/attached-files";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  getTraceLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    startTimer: () => () => {},
  }),
}));

const { sendPrompt, getSessionSnapshot, __resetSessionsForTests, __seedSessionForTests } =
  await import("coding-agent/session-manager");
const { SessionEventLog } = await import("coding-agent/event-log");

type Event = { type: string; [k: string]: unknown };
type Listener = (event: Event) => void;

function createMockPiSession(opts: {
  messages?: Array<unknown>;
  isStreaming?: boolean;
  prompt?: (text: string, options?: unknown) => Promise<void>;
}) {
  const listeners = new Set<Listener>();
  const promptCalls: Array<{ text: string; options: unknown }> = [];
  const subscribe = vi.fn((cb: Listener) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  });
  return {
    session: {
      messages: opts.messages ?? [],
      isStreaming: opts.isStreaming ?? false,
      subscribe,
      prompt: vi.fn((text: string, options?: unknown) => {
        promptCalls.push({ text, options });
        return (opts.prompt ?? (() => Promise.resolve()))(text, options);
      }),
    },
    __emit(event: Event) {
      for (const l of listeners) l(event);
    },
    promptCalls,
  };
}

const docBase64 = (content: string) => Buffer.from(content, "utf8").toString("base64");

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  __resetSessionsForTests();
});

describe("session-manager attachments", () => {
  it("inlines a text-file attachment into the prompt and calls Pi with no images option", async () => {
    const mock = createMockPiSession({ messages: [], isStreaming: false });
    __seedSessionForTests("s1", {
      sessionId: "s1",
      piSessionId: "pi-1",
      project: "p",
      runtime: { session: mock.session } as never,
      eventLog: new SessionEventLog(),
    });

    const stream = await sendPrompt(
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
      inlineAttachedFiles("check this", [
        { filename: "doc.txt", mimeType: "text/plain", content: "file body" },
      ]),
    );
    expect(call!.options).toBeUndefined();
  });

  it("passes images through PromptOptions.images and leaves the prompt text untouched", async () => {
    const mock = createMockPiSession({ messages: [], isStreaming: false });
    __seedSessionForTests("s2", {
      sessionId: "s2",
      piSessionId: "pi-2",
      project: "p",
      runtime: { session: mock.session } as never,
      eventLog: new SessionEventLog(),
    });

    const stream = await sendPrompt(
      "s2",
      "fallback",
      [
        {
          id: "u2",
          role: "user",
          content: [
            { type: "text", text: "look at this" },
            {
              type: "image",
              source: { type: "data", value: "aW1hZ2U=", mimeType: "image/png" },
            },
          ],
        },
      ],
      "r2",
    );
    await stream.cancel();

    expect(mock.promptCalls).toHaveLength(1);
    const [call] = mock.promptCalls;
    expect(call!.text).toBe("look at this");
    expect(call!.options).toEqual({
      images: [{ type: "image", data: "aW1hZ2U=", mimeType: "image/png" }],
    });
  });

  it("falls back to a single space when there is no typed text but there are images", async () => {
    const mock = createMockPiSession({ messages: [], isStreaming: false });
    __seedSessionForTests("s3", {
      sessionId: "s3",
      piSessionId: "pi-3",
      project: "p",
      runtime: { session: mock.session } as never,
      eventLog: new SessionEventLog(),
    });

    const stream = await sendPrompt(
      "s3",
      "",
      [
        {
          id: "u3",
          role: "user",
          content: [
            { type: "image", source: { type: "data", value: "aW1hZ2U=", mimeType: "image/png" } },
          ],
        },
      ],
      "r3",
    );
    await stream.cancel();

    expect(mock.promptCalls[0]!.text).toBe(" ");
  });

  it("keeps plain string content behaving exactly as before (no options passed)", async () => {
    const mock = createMockPiSession({ messages: [], isStreaming: false });
    __seedSessionForTests("s4", {
      sessionId: "s4",
      piSessionId: "pi-4",
      project: "p",
      runtime: { session: mock.session } as never,
      eventLog: new SessionEventLog(),
    });

    const stream = await sendPrompt(
      "s4",
      "hello",
      [{ id: "u4", role: "user", content: "hello" }],
      "r4",
    );
    await stream.cancel();

    expect(mock.promptCalls[0]).toEqual({ text: "hello", options: undefined });
  });

  it("reconstructs the original InputContent[] (text + image + document) after Pi stores and echoes the message back, contract-testing against the shape Pi's own prompt() produces", async () => {
    // Mirrors exactly what @earendil-works/pi-coding-agent's AgentSession.prompt()
    // does internally: userContent = [{type:"text",text}, ...images], pushed as
    // the stored message. If a future Pi version changes this shape, this test
    // (not just startPromptCollector's own stamping) is what would catch it.
    const storedUserMessage: Record<string, unknown> = {
      role: "user",
      content: [
        {
          type: "text",
          text: inlineAttachedFiles("look at this", [
            { filename: "doc.txt", mimeType: "text/plain", content: "file body" },
          ]),
        },
        { type: "image", data: "aW1hZ2U=", mimeType: "image/png" },
      ],
      timestamp: 9000,
    };
    // A deferred (not immediately-resolved) prompt() keeps startPromptCollector's
    // Pi-session subscription alive so message_end can be emitted manually below
    // — an instantly-resolving mock would let the collector's .then() chain
    // unsubscribe before this test gets a chance to emit anything.
    const prompt = deferred<void>();
    const mock = createMockPiSession({
      messages: [storedUserMessage],
      isStreaming: false,
      prompt: () => prompt.promise,
    });
    __seedSessionForTests("s5", {
      sessionId: "s5",
      piSessionId: "pi-5",
      project: "p",
      runtime: { session: mock.session } as never,
      eventLog: new SessionEventLog(),
    });

    await sendPrompt(
      "s5",
      "fallback",
      [
        {
          id: "client-msg-1",
          role: "user",
          content: [
            { type: "text", text: "look at this" },
            {
              type: "image",
              source: { type: "data", value: "aW1hZ2U=", mimeType: "image/png" },
            },
            {
              type: "document",
              source: { type: "data", value: docBase64("file body"), mimeType: "text/plain" },
              metadata: { filename: "doc.txt" },
            },
          ],
        },
      ],
      "r5",
    );

    mock.__emit({ type: "message_end", message: storedUserMessage });
    expect(storedUserMessage.clientMessageId).toBe("client-msg-1");
    expect(storedUserMessage.clientPromptText).toBe("look at this");

    const snapshot = await getSessionSnapshot("s5");
    const userMsg = snapshot.messages.find(
      (m): m is { id: string; role: string; content: unknown } =>
        (m as { role?: string }).role === "user",
    );
    expect(userMsg?.id).toBe("client-msg-1");
    expect(userMsg?.content).toEqual([
      { type: "text", text: "look at this" },
      {
        type: "image",
        source: { type: "data", value: "aW1hZ2U=", mimeType: "image/png" },
      },
      {
        type: "document",
        source: { type: "data", value: docBase64("file body"), mimeType: "text/plain" },
        metadata: { filename: "doc.txt" },
      },
    ]);

    prompt.resolve();
    await prompt.promise;
  });

  it("preserves the exact plain-string shape for messages with no attachments (backward compatibility)", async () => {
    const storedUserMessage: Record<string, unknown> = {
      role: "user",
      content: "plain old message",
      timestamp: 1234,
    };
    const mock = createMockPiSession({ messages: [storedUserMessage], isStreaming: false });
    __seedSessionForTests("s6", {
      sessionId: "s6",
      piSessionId: "pi-6",
      project: "p",
      runtime: { session: mock.session } as never,
      eventLog: new SessionEventLog(),
    });

    const snapshot = await getSessionSnapshot("s6");
    expect(snapshot.messages).toEqual([
      { id: "u-1234", role: "user", content: "plain old message" },
    ]);
  });
});
