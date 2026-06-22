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
  __resetSessionsForTests,
  __seedSessionForTests,
} = await import("coding-agent/session-manager");

type Event = { type: string; [k: string]: unknown };
type Listener = (event: Event) => void;

function createMockPiSession(opts: {
  messages?: Array<unknown>;
  isStreaming?: boolean;
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
    },
    __emit(event: Event) {
      for (const l of listeners) l(event);
    },
    __listeners: listeners,
  };
}

beforeEach(() => {
  __resetSessionsForTests();
});

describe("session-manager.connectToSession (reconnect bug fix)", () => {
  it("emits snapshot + agent_end and signals completion when session is idle and has no inFlight tools", async () => {
    const mock = createMockPiSession({
      messages: [{ role: "user", content: "hello" }],
      isStreaming: false,
    });
    __seedSessionForTests("s1", {
      sessionId: "s1",
      piSessionId: "pi-1",
      project: "p",
      runtime: { session: mock.session } as never,
      inFlightTools: new Map(),
    });

    const onEvent = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();

    const cleanup = await connectToSession("s1", onEvent, onError, onComplete);

    const events = onEvent.mock.calls.map((c) =>
      JSON.parse(c[0] as string),
    );
    const types = events.map((e) => e.type);
    expect(types).toContain("snapshot");
    expect(types).toContain("agent_end");
    expect(types.indexOf("snapshot")).toBeLessThan(
      types.indexOf("agent_end"),
    );

    const snapshotEvent = events.find((e) => e.type === "snapshot");
    expect(snapshotEvent?.isStreaming).toBe(false);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(mock.__listeners.size).toBe(0);

    cleanup();
  });

  it("does not signal completion while session is still streaming and keeps the subscription live", async () => {
    const mock = createMockPiSession({
      messages: [],
      isStreaming: true,
    });
    __seedSessionForTests("s2", {
      sessionId: "s2",
      piSessionId: "pi-2",
      project: "p",
      runtime: { session: mock.session } as never,
      inFlightTools: new Map(),
    });

    const onEvent = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();

    const cleanup = await connectToSession("s2", onEvent, onError, onComplete);

    expect(onComplete).not.toHaveBeenCalled();
    expect(onEvent.mock.calls.length).toBeGreaterThan(0);

    const snapshotEvent = onEvent.mock.calls
      .map((c) => JSON.parse(c[0] as string))
      .find((e: Event) => e.type === "snapshot");
    expect(snapshotEvent?.isStreaming).toBe(true);

    mock.__emit({ type: "message_update", delta: "live" });
    expect(
      onEvent.mock.calls.some((c) =>
        (c[0] as string).includes("message_update"),
      ),
    ).toBe(true);

    cleanup();
    expect(mock.__listeners.size).toBe(0);
  });

  it("does not signal completion when there are inFlight tools in the snapshot", async () => {
    const mock = createMockPiSession({
      messages: [],
      isStreaming: false,
    });
    const inFlight = new Map<
      number,
      { toolCallId: string; name: string; argsSoFar: string; callEnded: boolean }
    >();
    inFlight.set(0, {
      toolCallId: "t1",
      name: "bash",
      argsSoFar: '{"c',
      callEnded: false,
    });

    __seedSessionForTests("s3", {
      sessionId: "s3",
      piSessionId: "pi-3",
      project: "p",
      runtime: { session: mock.session } as never,
      inFlightTools: inFlight,
    });

    const onEvent = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();

    const cleanup = await connectToSession("s3", onEvent, onError, onComplete);

    const snapshot = onEvent.mock.calls
      .map((c) => JSON.parse(c[0] as string))
      .find((e) => e.type === "snapshot");
    expect(snapshot).toBeDefined();
    expect(snapshot?.inFlight).toEqual([
      expect.objectContaining({ toolCallId: "t1", name: "bash" }),
    ]);
    expect(snapshot?.isStreaming).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();

    cleanup();
  });
});
