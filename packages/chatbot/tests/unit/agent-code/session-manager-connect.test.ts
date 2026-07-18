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
  getSessionSnapshot,
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
  it("returns the Pi snapshot with the worker-owned replay cursor", async () => {
    const mock = createMockPiSession({
      messages: [{ role: "user", content: "finalized", timestamp: 1 }],
      isStreaming: true,
    });
    const eventLog = new SessionEventLog();
    eventLog.append({ type: EventType.RUN_STARTED, threadId: "snapshot", runId: "r1" } as never);
    eventLog.append({ type: EventType.MESSAGES_SNAPSHOT, messages: [] } as never);
    eventLog.append({ type: EventType.TEXT_MESSAGE_CHUNK, messageId: "m1", role: "assistant", delta: "partial" } as never);

    __seedSessionForTests("snapshot", {
      sessionId: "snapshot",
      piSessionId: "pi-snapshot",
      project: "p",
      runtime: { session: mock.session } as never,
      eventLog,
      activeRun: {
        runId: "r1",
        startSeq: 1,
        unsubscribe: () => {},
        sawTerminal: false,
      },
      // Pi has committed the user message but not the partial assistant text.
      snapshotCursorSeq: 2,
    });

    const snapshot = await getSessionSnapshot("snapshot");

    expect(snapshot.messages).toEqual([
      expect.objectContaining({ role: "user", content: "finalized" }),
    ]);
    expect(snapshot.cursor).toEqual({ epoch: eventLog.epoch, seq: 2 });
    expect(snapshot.running).toBe(true);
  });

  it("rejects a cursor from a previous worker epoch", async () => {
    const mock = createMockPiSession({ messages: [], isStreaming: true });
    const eventLog = new SessionEventLog();
    __seedSessionForTests("epoch", {
      sessionId: "epoch",
      piSessionId: "pi-epoch",
      project: "p",
      runtime: { session: mock.session } as never,
      eventLog,
      activeRun: {
        runId: "r1",
        startSeq: 1,
        unsubscribe: () => {},
        sawTerminal: false,
      },
    });

    await expect(
      connectToSession("epoch", vi.fn(), vi.fn(), vi.fn(), 0, "old-epoch"),
    ).rejects.toThrow("Cursor epoch mismatch");
  });

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
      eventLog,
    });

    const onEvent = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();

    const cleanup = await connectToSession("s1", onEvent, onError, onComplete, 1, eventLog.epoch);

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

    const cleanup = await connectToSession("s2", onEvent, onError, onComplete, 1, eventLog.epoch);

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

  it("completes immediately when there is no session to replay", async () => {
    const onEvent = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();

    const cleanup = await connectToSession("missing", onEvent, onError, onComplete, 0, "any-epoch");

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
    const cleanup = await connectToSession("s4", onEvent, onError, onComplete, 1, eventLog.epoch);

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

  it("builds the run-start snapshot from canonical Pi state plus the trailing user echo, not the client's full echo", async () => {
    const prompt = deferred<void>();
    const mock = createMockPiSession({
      messages: [
        { role: "user", content: "first question", timestamp: 1000 },
        {
          role: "assistant",
          timestamp: 2000,
          content: [
            { type: "thinking", thinking: "let me think" },
            { type: "text", text: "first answer" },
          ],
        },
      ],
      isStreaming: false,
      prompt: () => prompt.promise,
    });
    const eventLog = new SessionEventLog();

    __seedSessionForTests("s5", {
      sessionId: "s5",
      piSessionId: "pi-5",
      project: "p",
      runtime: { session: mock.session } as never,
      eventLog,
    });

    // The client echoes its own view of history with optimistic/stale ids
    // (uuid user message, legacy reasoning ids). Only the trailing user
    // message may survive into the snapshot.
    const stream = await sendPrompt(
      "s5",
      "second question",
      [
        { id: "stale-reason-1", role: "reasoning", content: "let me think" },
        { id: "client-uuid-old", role: "user", content: "first question" },
        { id: "client-uuid-new", role: "user", content: "second question" },
      ],
      "r5",
    );
    const reader = stream.getReader();

    mock.__emit({ type: "agent_start" });
    await reader.read(); // RUN_STARTED
    const second = await reader.read();
    const snapshot = JSON.parse(new TextDecoder().decode(second.value)).event;
    expect(snapshot.type).toBe(EventType.MESSAGES_SNAPSHOT);
    expect(snapshot.messages).toEqual([
      { id: "u-1000", role: "user", content: "first question" },
      { id: "a-2000-reason", role: "reasoning", content: "let me think" },
      { id: "a-2000", role: "assistant", content: "first answer" },
      { id: "client-uuid-new", role: "user", content: "second question" },
    ]);

    await reader.cancel();
    mock.__emit({ type: "agent_end" });
    prompt.resolve();
    await prompt.promise;
  });

  it("replays from a snapshot cursor taken past finalized message/tool cycles, skipping the stale run-start snapshot", async () => {
    const prompt = deferred<void>();
    const mock = createMockPiSession({
      messages: [],
      isStreaming: false,
      prompt: () => prompt.promise,
    });
    const eventLog = new SessionEventLog();

    __seedSessionForTests("s9", {
      sessionId: "s9",
      piSessionId: "pi-9",
      project: "p",
      runtime: { session: mock.session } as never,
      eventLog,
    });

    const stream = await sendPrompt(
      "s9",
      "fix the bug",
      [{ id: "client-uuid", role: "user", content: "fix the bug" }],
      "r9",
    );
    const reader = stream.getReader();

    mock.__emit({ type: "agent_start" });
    await reader.read(); // RUN_STARTED

    function emitFullCycle(toolCallId: string) {
      mock.__emit({ type: "message_start", message: { role: "assistant", timestamp: Date.now() } });
      mock.__emit({
        type: "message_update",
        assistantMessageEvent: { type: "thinking_delta", delta: `reasoning for ${toolCallId}` },
      });
      mock.__emit({
        type: "message_update",
        assistantMessageEvent: {
          type: "toolcall_start",
          contentIndex: 0,
          toolCall: { type: "toolCall", id: toolCallId, name: "bash" },
        },
      });
      mock.__emit({
        type: "message_update",
        assistantMessageEvent: { type: "toolcall_end", contentIndex: 0 },
      });
      mock.__emit({ type: "message_end", message: { role: "assistant" } });
      mock.__emit({ type: "tool_execution_start", toolCallId, toolName: "bash", args: {} });
      mock.__emit({
        type: "tool_execution_end",
        toolCallId,
        toolName: "bash",
        result: `output for ${toolCallId}`,
        isError: false,
      });
    }

    // Two fully-finalized cycles (as if this run had already made progress
    // by the time a browser refresh triggers a reconnect)...
    emitFullCycle("call1");
    emitFullCycle("call2");
    // ...then a third cycle still in progress at reconnect time.
    mock.__emit({ type: "message_start", message: { role: "assistant", timestamp: Date.now() } });
    mock.__emit({
      type: "message_update",
      assistantMessageEvent: { type: "thinking_delta", delta: "in progress" },
    });

    const snapshot = await getSessionSnapshot("s9");
    expect(snapshot.cursor).not.toBeNull();

    const onEvent = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();
    const cleanup = await connectToSession(
      "s9",
      onEvent,
      onError,
      onComplete,
      snapshot.cursor!.seq,
      snapshot.cursor!.epoch,
    );

    const replayed = parseLines(onEvent).map((e) => e.event);
    // No MESSAGES_SNAPSHOT: by the time the snapshot cursor was taken the
    // first cycle had already finalized, so the client's SSR-loaded state
    // supersedes it — replaying it would scramble message order
    // (positional merge against the client's current, more-current list)
    // and duplicate content.
    expect(replayed.some((e) => e.type === EventType.MESSAGES_SNAPSHOT)).toBe(false);
    // No events from the two already-finalized cycles either — the client's
    // SSR-loaded state already has their full content; replaying their
    // deltas again would duplicate it.
    const toolCallIds = replayed
      .map((e) => (e as { toolCallId?: string }).toolCallId)
      .filter((id): id is string => typeof id === "string");
    expect(toolCallIds).not.toContain("call1");
    expect(toolCallIds).not.toContain("call2");
    // Only the third, still-in-progress cycle's delta is replayed.
    expect(
      replayed.some(
        (e) =>
          e.type === EventType.REASONING_MESSAGE_CHUNK &&
          (e as { delta?: string }).delta === "in progress",
      ),
    ).toBe(true);
    expect(onError).not.toHaveBeenCalled();

    cleanup();
    mock.__emit({ type: "agent_end" });
    prompt.resolve();
    await prompt.promise;
  });

  it("stamps the client's user message id onto Pi's message object so snapshot rebuilds return it", async () => {
    const prompt = deferred<void>();
    // The same object reference Pi would hand to subscribers on `message_end`
    // and keep in `session.messages` — mutating it in the collector must be
    // visible through both.
    const userMessage: Record<string, unknown> = {
      role: "user",
      content: "hello",
      timestamp: 5000,
    };
    const mock = createMockPiSession({
      messages: [userMessage],
      isStreaming: false,
      prompt: () => prompt.promise,
    });
    const eventLog = new SessionEventLog();

    __seedSessionForTests("s10", {
      sessionId: "s10",
      piSessionId: "pi-10",
      project: "p",
      runtime: { session: mock.session } as never,
      eventLog,
    });

    const stream = await sendPrompt(
      "s10",
      "hello",
      [{ id: "client-msg-1", role: "user", content: "hello" }],
      "r10",
    );
    const reader = stream.getReader();

    mock.__emit({ type: "agent_start" });
    await reader.read(); // RUN_STARTED
    await reader.read(); // MESSAGES_SNAPSHOT

    mock.__emit({ type: "message_end", message: userMessage });

    expect(userMessage.clientMessageId).toBe("client-msg-1");

    const snapshot = await getSessionSnapshot("s10");
    expect(snapshot.messages).toContainEqual(
      expect.objectContaining({ id: "client-msg-1", role: "user", content: "hello" }),
    );

    await reader.cancel();
    mock.__emit({ type: "agent_end" });
    prompt.resolve();
    await prompt.promise;
  });
});
