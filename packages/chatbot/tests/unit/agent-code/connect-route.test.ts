/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventType } from "@ag-ui/client";
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
type LoggedEvent = { seq: number; event: { type: string; [k: string]: unknown } };

const mockState: {
  events: LoggedEvent[];
  connectParams: unknown[];
} = vi.hoisted(() => ({
  events: [] as LoggedEvent[],
  connectParams: [] as unknown[],
}));

vi.mock("@/lib/features/code/worker-client", () => ({
  WorkerClient: class {
    async initializeSession() {
      return { sessionId: "stub-session", piSessionId: "stub-pi-session" };
    }
    async connectToSession(params: unknown) {
      mockState.connectParams.push(params);
      return new ReadableStream<Uint8Array>({
        start(controller) {
          for (const e of mockState.events) {
            controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
          }
          controller.close();
        },
      });
    }
  },
}));

import { POST } from "@/app/(chat)/api/agent/code/connect/route";
import { CODING_AGENT_CURSOR_EVENT } from "@/lib/features/code/agui-stream-relay";

function parseSseEvents(text: string): Array<{ type: string; [k: string]: any }> {
  return text
    .split("\n\n")
    .filter((s) => s.startsWith("data: "))
    .map((s) => JSON.parse(s.replace(/^data: /, "")) as { type: string; [k: string]: any });
}

function makeRequest(afterSeq = "0") {
  return new Request("http://test/api/agent/code/connect", {
    method: "POST",
    body: JSON.stringify({
      threadId: "t1",
      runId: "connect-run",
      context: [
        { description: "project", value: "p" },
        { description: "sessionId", value: "s" },
        { description: "modelId", value: "Deepseek v4 Pro" },
      ],
      forwardedProps: { afterSeq },
      messages: [],
    }),
  });
}

beforeEach(() => {
  mockState.events = [];
  mockState.connectParams = [];
});

describe("POST /api/agent/code/connect", () => {
  it("emits a synthetic RUN_STARTED, relays logged AG-UI events, and advances cursor", async () => {
    mockState.events = [
      {
        seq: 1,
        event: {
          type: EventType.RUN_STARTED,
          threadId: "s",
          runId: "worker-run",
        },
      },
      {
        seq: 2,
        event: {
          type: EventType.TEXT_MESSAGE_CHUNK,
          messageId: "m1",
          role: "assistant",
          delta: "hello",
        },
      },
      {
        seq: 3,
        event: {
          type: EventType.RUN_FINISHED,
          threadId: "s",
          runId: "worker-run",
        },
      },
    ];

    const res = await POST(makeRequest("7") as never);
    expect(res.status).toBe(200);

    const events = parseSseEvents(await res.text());

    expect(mockState.connectParams[0]).toEqual(
      expect.objectContaining({ sessionId: "s", afterSeq: 7 }),
    );
    expect(events[0]).toEqual(
      expect.objectContaining({
        type: EventType.RUN_STARTED,
        threadId: "s",
        runId: "connect-run",
      }),
    );
    expect(events[1]).toEqual(
      expect.objectContaining({
        type: EventType.CUSTOM,
        name: CODING_AGENT_CURSOR_EVENT,
        value: { seq: 1 },
      }),
    );
    expect(events[2]).toEqual(
      expect.objectContaining({
        type: EventType.TEXT_MESSAGE_CHUNK,
        messageId: "m1",
        delta: "hello",
      }),
    );
    expect(events[3]).toEqual(
      expect.objectContaining({
        type: EventType.CUSTOM,
        name: CODING_AGENT_CURSOR_EVENT,
        value: { seq: 2 },
      }),
    );
    expect(events[4]).toEqual(
      expect.objectContaining({
        type: EventType.CUSTOM,
        name: CODING_AGENT_CURSOR_EVENT,
        value: { seq: 3 },
      }),
    );
    expect(events[5].type).toBe(EventType.RUN_FINISHED);
    expect(events[6]).toBeUndefined();
  });

  it("finishes the synthetic connect run when worker has no events to replay", async () => {
    const res = await POST(makeRequest() as never);
    const events = parseSseEvents(await res.text());

    expect(events.map((e) => e.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.RUN_FINISHED,
    ]);
  });
});
