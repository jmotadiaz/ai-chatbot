import { describe, it, expect, vi } from "vitest";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  acquireTraceSink: async () => null,
  releaseTraceSink: async () => {},
  retainTraceSink: () => async () => {},
  getTraceLogger: () => ({
    info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
    startTimer: () => () => {},
  }),
}));

const { startSubagentCollector } = await import("../../src/subagent-collector");
const { SessionEventLog } = await import("../../src/event-log");

function fakeChildSession() {
  const listeners = new Set<(e: unknown) => void>();
  return {
    isStreaming: true,
    messages: [] as unknown[],
    subscribe(cb: (e: unknown) => void) { listeners.add(cb); return () => listeners.delete(cb); },
    __emit(e: unknown) { for (const l of listeners) l(e); },
  };
}

describe("startSubagentCollector", () => {
  it("appends translated AG-UI events to the child event log", () => {
    const session = fakeChildSession();
    const eventLog = new SessionEventLog();
    const entry = { sessionId: "child-1", runtime: { session }, eventLog, snapshotCursorSeq: 0 };
    const stop = startSubagentCollector(entry as never, "run-1");

    session.__emit({ type: "agent_start" });
    session.__emit({
      type: "message_start",
      message: { role: "assistant", timestamp: 123, content: [] },
    });

    const types = eventLog.readAfter(0).map((l) => l.event.type);
    expect(types).toContain("RUN_STARTED");
    stop();
  });

  it("advances snapshotCursorSeq on message_end", () => {
    const session = fakeChildSession();
    const eventLog = new SessionEventLog();
    const entry = { sessionId: "child-1", runtime: { session }, eventLog, snapshotCursorSeq: 0 };
    const stop = startSubagentCollector(entry as never, "run-1");

    session.__emit({ type: "message_end", message: { role: "assistant", timestamp: 1, content: [] } });
    expect(entry.snapshotCursorSeq).toBe(eventLog.lastSeq);
    stop();
  });

  it("unsubscribe stops the flow", () => {
    const session = fakeChildSession();
    const eventLog = new SessionEventLog();
    const entry = { sessionId: "child-1", runtime: { session }, eventLog, snapshotCursorSeq: 0 };
    const stop = startSubagentCollector(entry as never, "run-1");
    stop();
    const before = eventLog.lastSeq;
    session.__emit({ type: "agent_start" });
    expect(eventLog.lastSeq).toBe(before);
  });
});
