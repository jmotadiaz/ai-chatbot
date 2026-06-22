/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/features/auth/with-auth/handler", () => ({
  withAuth:
    <T>(handler: T) =>
    async (req: Request) =>
      (handler as never as (user: { id: string }, req: Request) => Promise<Response>)(
        { id: "user-1" },
        req,
      ),
}));

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  FileTraceSink: class {
    async open() {}
    async close() {}
  },
  runWithTraceContext: <T>(_ctx: unknown, fn: () => Promise<T>) => fn(),
  getTraceLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    startTimer: () => () => {},
  }),
}));

vi.mock("@/lib/features/code/session-store", () => ({
  getSession: vi.fn().mockResolvedValue({ piSessionId: "stub-pi-session" }),
  touchSession: vi.fn().mockResolvedValue(undefined),
  updatePiSessionId: vi.fn().mockResolvedValue(undefined),
  updateSessionLabel: vi.fn().mockResolvedValue(undefined),
}));

const encoder = new TextEncoder();
type LiveEvent = { type: string; [k: string]: unknown };

const mockEvents: { current: LiveEvent[] } = vi.hoisted(() => ({
  current: [] as LiveEvent[],
}));

vi.mock("@/lib/features/code/worker-client", () => ({
  WorkerClient: class {
    baseUrl = "";
    id = 0;
    async initializeSession() {
      return { sessionId: "stub-session", piSessionId: "stub-pi-session" };
    }
    async connectToSession() {
      return new ReadableStream<Uint8Array>({
        start(controller) {
          for (const e of mockEvents.current) {
            controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
          }
          controller.close();
        },
      });
    }
  },
}));

import { POST } from "@/app/(chat)/api/agent/code/connect/route";

function parseSseEvents(text: string): Array<{ type: string; [k: string]: unknown }> {
  return text
    .split("\n\n")
    .filter((s) => s.startsWith("data: "))
    .map((s) => JSON.parse(s.replace(/^data: /, "")) as { type: string; [k: string]: unknown });
}

function makeRequest() {
  return new Request("http://test/api/agent/code/connect", {
    method: "POST",
    body: JSON.stringify({
      threadId: "t1",
      context: [
        { description: "project", value: "p" },
        { description: "sessionId", value: "s" },
        { description: "modelId", value: "Deepseek v4 Pro" },
      ],
      messages: [],
    }),
  });
}

beforeEach(() => {
  mockEvents.current = [];
});

describe("POST /api/agent/code/connect", () => {
  it("emits MESSAGES_SNAPSHOT before live events", async () => {
    mockEvents.current = [
      {
        type: "snapshot",
        messages: [{ id: "loaded-0", role: "user", content: "hello" }],
        inFlight: [
          {
            toolCallId: "t1",
            name: "bash",
            argsSoFar: '{"c',
            contentIndex: 0,
          },
        ],
      },
      { type: "agent_start" },
      { type: "agent_end" },
    ];

    const res = await POST(makeRequest() as never);
    expect(res.status).toBe(200);

    const events = parseSseEvents(await res.text());

    // RUN_STARTED is emitted first to satisfy the AG-UI verifyEvents invariant
    // (the first event of any run must be RUN_STARTED or RUN_ERROR).
    // The translated `agent_start` from the worker would also become
    // RUN_STARTED; the route suppresses it to avoid a duplicate.
    expect(events[0].type).toBe("RUN_STARTED");
    expect(events[0].threadId).toBe("s");
    expect(events[1].type).toBe("MESSAGES_SNAPSHOT");
    expect(events[1].messages).toEqual([
      { id: "loaded-0", role: "user", content: "hello" },
    ]);
    expect(events[2].type).toBe("TOOL_CALL_START");
    expect(events[2].toolCallId).toBe("t1");
    expect(events[2].toolCallName).toBe("bash");
    expect(events[3].type).toBe("TOOL_CALL_ARGS");
    expect(events[3].toolCallId).toBe("t1");
    expect(events[3].delta).toBe('{"c');
    expect(events[4].type).toBe("STEP_FINISHED");
    expect(events[4].stepName).toBe("tool:bash:t1");
    expect((events[4] as any).rawEvent.toolCallId).toBe("t1");
    expect((events[4] as any).rawEvent.isError).toBe(true);
    expect(events[5].type).toBe("RUN_FINISHED");
  });

  it("does not drop text_delta from live stream when snapshot has inFlight tools", async () => {
    // Simulates a live recovery: snapshot with in-flight tool calls, then
    // a text_delta arrives BEFORE any new message_start. The translator
    // should be seeded from the snapshot so the text_delta is emitted
    // (not dropped) and the tool calls carry a valid parentMessageId.
    mockEvents.current = [
      {
        type: "snapshot",
        messages: [{ id: "loaded-0", role: "user", content: "hello" }],
        inFlight: [
          {
            toolCallId: "t1",
            name: "bash",
            argsSoFar: '{"c',
            contentIndex: 0,
            parentMessageId: "msg-live-1",
          },
        ],
      },
      {
        type: "message_update",
        assistantMessageEvent: {
          type: "text_delta",
          contentIndex: 1,
          delta: "hello world",
        },
      },
      { type: "agent_end" },
    ];

    const res = await POST(makeRequest() as never);
    const events = parseSseEvents(await res.text());

    const textChunks = events.filter((e) => e.type === "TEXT_MESSAGE_CHUNK");
    expect(textChunks).toHaveLength(1);
    expect((textChunks[0] as unknown as { delta: string }).delta).toBe("hello world");
  });

  it("emits toolcall_delta from live stream when snapshot has inFlight tool with matching contentIndex", async () => {
    // The snapshot includes an in-flight tool at contentIndex=0 with partial
    // args. A live toolcall_delta with the same contentIndex should be
    // emitted as TOOL_CALL_ARGS (not dropped because no activeToolCalls entry).
    mockEvents.current = [
      {
        type: "snapshot",
        messages: [{ id: "loaded-0", role: "user", content: "hello" }],
        inFlight: [
          {
            toolCallId: "t1",
            name: "bash",
            argsSoFar: '{"c',
            contentIndex: 0,
          },
        ],
      },
      {
        type: "message_update",
        assistantMessageEvent: {
          type: "toolcall_delta",
          contentIndex: 0,
          delta: 'ommand":"ls"}',
        },
      },
      { type: "agent_end" },
    ];

    const res = await POST(makeRequest() as never);
    const events = parseSseEvents(await res.text());

    // The snapshot already emits a TOOL_CALL_ARGS with argsSoFar='{"c'.
    // The live toolcall_delta should add another TOOL_CALL_ARGS, not be
    // dropped. We look for the delta from the live event specifically.
    const argsEvents = events.filter(
      (e) => e.type === "TOOL_CALL_ARGS" && (e as { delta?: string }).delta === 'ommand":"ls"}',
    );
    expect(argsEvents).toHaveLength(1);
  });
});
