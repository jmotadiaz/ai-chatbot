import { EventType } from "@ag-ui/client";
import { describe, it, expect, vi, beforeEach } from "vitest";

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

const {
  connectToSession,
  sendPrompt,
  __resetSessionsForTests,
  __seedSessionForTests,
} = await import("coding-agent/session-manager");
const { SessionEventLog } = await import("coding-agent/event-log");

type Event = { type: string; [k: string]: unknown };
type Listener = (event: Event) => void;

function createMockPiSession(opts: {
  messages?: Array<unknown>;
  isStreaming?: boolean;
  prompt?: () => Promise<void>;
}) {
  const listeners = new Set<Listener>();
  const subscribe = vi.fn((cb: Listener) => {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  });
  return {
    session: {
      messages: opts.messages ?? [],
      isStreaming: opts.isStreaming ?? false,
      subscribe,
      prompt: vi.fn(opts.prompt ?? (() => Promise.resolve())),
    },
    __emit(event: Event) {
      for (const l of listeners) l(event);
    },
    __listeners: listeners,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function parseLines(onEvent: ReturnType<typeof vi.fn>) {
  return onEvent.mock.calls.map((c) =>
    JSON.parse(c[0] as string),
  ) as Array<{ seq: number; event: Event }>;
}

beforeEach(() => {
  __resetSessionsForTests();
});

describe("session-manager.connectToSession event-log replay", () => {
  it("replays logged AG-UI events after the requested cursor and completes on terminal", async () => {
    const mock = createMockPiSession({
      messages: [{ role: "user", content: "hello" }],
      isStreaming: false,
    });
    const eventLog = new SessionEventLog();
    eventLog.append({ type: EventType.RUN_STARTED, threadId: "s1", runId: "r1" } as never);
    eventLog.append({ type: EventType.TEXT_MESSAGE_CHUNK, messageId: "m1", role: "assistant", delta: "hi" } as never);
    eventLog.append({ type: EventType.RUN_FINISHED, threadId: "s1", runId: "r1" } as never);

    __seedSessionForTests("s1", {
      sessionId: "s1",
      piSessionId: "pi-1",
      project: "p",
      runtime: { session: mock.session } as never,
      inFlightTools: new Map(),
      eventLog,
    });

    const onEvent = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();

    const cleanup = await connectToSession("s1", onEvent, onError, onComplete, 1);

    const events = parseLines(onEvent);
    expect(events.map((e) => e.seq)).toEqual([2, 3]);
    expect(events.map((e) => e.event.type)).toEqual([
      EventType.TEXT_MESSAGE_CHUNK,
      EventType.RUN_FINISHED,
    ]);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(mock.session.subscribe).not.toHaveBeenCalled();

    cleanup();
  });

  it("keeps the event-log subscription live while the active run is streaming", async () => {
    const mock = createMockPiSession({
      messages: [],
      isStreaming: true,
    });
    const eventLog = new SessionEventLog();
    eventLog.append({ type: EventType.RUN_STARTED, threadId: "s2", runId: "r2" } as never);

    __seedSessionForTests("s2", {
      sessionId: "s2",
      piSessionId: "pi-2",
      project: "p",
      runtime: { session: mock.session } as never,
      inFlightTools: new Map(),
      eventLog,
      activeRun: {
        runId: "r2",
        startSeq: 2,
        unsubscribe: () => {},
        sawTerminal: false,
      },
    });

    const onEvent = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();

    const cleanup = await connectToSession("s2", onEvent, onError, onComplete, 1);

    expect(onEvent).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(mock.session.subscribe).not.toHaveBeenCalled();

    eventLog.append({ type: EventType.TEXT_MESSAGE_CHUNK, messageId: "m2", role: "assistant", delta: "live" } as never);
    expect(parseLines(onEvent).map((e) => e.event.type)).toEqual([
      EventType.TEXT_MESSAGE_CHUNK,
    ]);

    eventLog.append({ type: EventType.RUN_FINISHED, threadId: "s2", runId: "r2" } as never);
    expect(onComplete).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("defaults to replaying from the active run start when no cursor is provided", async () => {
    const mock = createMockPiSession({
      messages: [],
      isStreaming: true,
    });
    const eventLog = new SessionEventLog();
    eventLog.append({ type: EventType.RUN_STARTED, threadId: "s5", runId: "old" } as never);
    eventLog.append({ type: EventType.RUN_FINISHED, threadId: "s5", runId: "old" } as never);
    const activeStart = eventLog.lastSeq + 1;
    eventLog.append({ type: EventType.RUN_STARTED, threadId: "s5", runId: "active" } as never);
    eventLog.append({ type: EventType.TEXT_MESSAGE_CHUNK, messageId: "m5", role: "assistant", delta: "active" } as never);

    __seedSessionForTests("s5", {
      sessionId: "s5",
      piSessionId: "pi-5",
      project: "p",
      runtime: { session: mock.session } as never,
      inFlightTools: new Map(),
      eventLog,
      activeRun: {
        runId: "active",
        startSeq: activeStart,
        unsubscribe: () => {},
        sawTerminal: false,
      },
    });

    const onEvent = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();

    const cleanup = await connectToSession("s5", onEvent, onError, onComplete);

    expect(parseLines(onEvent).map((e) => e.event.runId ?? e.event.type)).toEqual([
      "active",
      EventType.TEXT_MESSAGE_CHUNK,
    ]);
    expect(onError).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();

    cleanup();
  });

  it("completes immediately when there is no session to replay", async () => {
    const onEvent = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();

    const cleanup = await connectToSession("missing", onEvent, onError, onComplete, 0);

    expect(onEvent).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("keeps collecting Pi events after the sendPrompt HTTP stream is cancelled", async () => {
    const prompt = deferred<void>();
    const mock = createMockPiSession({
      messages: [],
      isStreaming: false,
      prompt: () => prompt.promise,
    });
    const eventLog = new SessionEventLog();

    __seedSessionForTests("s4", {
      sessionId: "s4",
      piSessionId: "pi-4",
      project: "p",
      runtime: { session: mock.session } as never,
      inFlightTools: new Map(),
      eventLog,
    });

    const stream = await sendPrompt(
      "s4",
      "hello",
      [{ id: "u1", role: "user", content: "hello" }],
      "r4",
    );
    const reader = stream.getReader();

    mock.__emit({ type: "agent_start" });
    const first = await reader.read();
    expect(JSON.parse(new TextDecoder().decode(first.value)).event.type).toBe(
      EventType.RUN_STARTED,
    );

    await reader.cancel();
    expect(mock.__listeners.size).toBe(1);

    mock.__emit({ type: "message_start", message: { role: "assistant" } });
    mock.__emit({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "still alive" },
    });
    mock.__emit({ type: "message_end", message: { role: "assistant" } });
    mock.__emit({ type: "agent_end" });
    prompt.resolve();
    await prompt.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mock.__listeners.size).toBe(0);

    const onEvent = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();
    const cleanup = await connectToSession("s4", onEvent, onError, onComplete, 1);

    expect(parseLines(onEvent).map((e) => e.event.type)).toEqual([
      EventType.MESSAGES_SNAPSHOT,
      EventType.TEXT_MESSAGE_CHUNK,
      EventType.RUN_FINISHED,
    ]);
    const replayed = parseLines(onEvent);
    expect(replayed[0].event.messages).toEqual([
      { id: "u1", role: "user", content: "hello" },
    ]);
    expect(onError).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
    cleanup();
  });
});
