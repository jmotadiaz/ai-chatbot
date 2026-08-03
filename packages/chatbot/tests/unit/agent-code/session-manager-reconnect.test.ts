import { EventType } from "@ag-ui/client";
import { describe, it, expect, vi, beforeEach } from "vitest";

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

const { connectToSession, __resetSessionsForTests, __seedSessionForTests } =
  await import("coding-agent/session-manager");
const { SessionEventLog } = await import("coding-agent/event-log");

type Event = { type: string; [k: string]: unknown };
type Envelope = { epoch: string; seq: number; event: Event };

const turnEvents: Event[] = [
  { type: EventType.TOOL_CALL_START, toolCallId: "t1", toolCallName: "write", parentMessageId: "m1" },
  { type: EventType.TOOL_CALL_ARGS, toolCallId: "t1", delta: '{"path"' },
  { type: EventType.TOOL_CALL_ARGS, toolCallId: "t1", delta: ':"a.ts"}' },
  { type: EventType.TOOL_CALL_END, toolCallId: "t1" },
  { type: EventType.STEP_STARTED, stepName: "tool:write:t1", rawEvent: { toolCallId: "t1" } },
  { type: EventType.STEP_FINISHED, stepName: "tool:write:t1" },
  { type: EventType.CUSTOM, name: "coding_agent_files_changed", value: { files: [] } },
  { type: EventType.RUN_FINISHED },
];

beforeEach(() => {
  __resetSessionsForTests();
});

describe("connectToSession synthetic prelude", () => {
  async function connect(sessionId: string, afterSeq: number): Promise<Envelope[]> {
    const eventLog = new SessionEventLog();
    for (const event of turnEvents) eventLog.append(event as never);
    __seedSessionForTests(sessionId, {
      sessionId,
      piSessionId: `pi-${sessionId}`,
      project: "proj",
      runtime: { session: { isStreaming: false, messages: [] } } as never,
      eventLog,
    } as never);

    const lines: Envelope[] = [];
    let done!: () => void;
    const completed = new Promise<void>((res) => {
      done = res;
    });
    await connectToSession(
      sessionId,
      (line: string) => lines.push(JSON.parse(line) as Envelope),
      (err: Error) => {
        throw err;
      },
      done,
      afterSeq,
      eventLog.epoch,
    );
    await completed;
    return lines;
  }

  it("re-opens a tool call when the cursor falls mid-args", async () => {
    const lines = await connect("rc1", 2);

    expect(lines[0]).toMatchObject({
      seq: 2,
      event: {
        type: EventType.TOOL_CALL_START,
        toolCallId: "t1",
        toolCallName: "write",
        parentMessageId: "m1",
      },
    });
    // The replayed tail follows, through to the terminal event.
    expect(lines.slice(1).map((l) => l.seq)).toEqual([3, 4, 5, 6, 7, 8]);
    const types = lines.map((l) => l.event.type);
    expect(types).toContain(EventType.CUSTOM);
    expect(types[types.length - 1]).toBe(EventType.RUN_FINISHED);
  });

  it("re-opens the step when the cursor falls mid-execution", async () => {
    const lines = await connect("rc2", 5);

    expect(lines[0]).toMatchObject({
      seq: 5,
      event: {
        type: EventType.STEP_STARTED,
        stepName: "tool:write:t1",
        rawEvent: { toolCallId: "t1" },
      },
    });
    expect(lines.slice(1).map((l) => l.seq)).toEqual([6, 7, 8]);
  });

  it("emits no prelude when the cursor sits on a boundary", async () => {
    const lines = await connect("rc3", 6);
    expect(lines.map((l) => l.seq)).toEqual([7, 8]);
  });
});
