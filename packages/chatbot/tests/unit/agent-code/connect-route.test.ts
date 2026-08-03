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
  acquireTraceSink: async () => null,
  releaseTraceSink: async () => {},
  retainTraceSink: () => async () => {},
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
  getSession: vi.fn().mockResolvedValue({
    piSessionId: "stub-pi-session",
    project: "p",
  }),
  touchSession: vi.fn().mockResolvedValue(undefined),
  updatePiSessionId: vi.fn().mockResolvedValue(undefined),
  updateSessionLabel: vi.fn().mockResolvedValue(undefined),
}));

const encoder = new TextEncoder();
type LoggedEvent = { epoch?: string; seq: number; event: { type: string; [k: string]: unknown } };

const mockState: {
  events: LoggedEvent[];
  connectParams: unknown[];
  initParams: unknown[];
  epochMismatch: boolean;
} = vi.hoisted(() => ({
  events: [] as LoggedEvent[],
  connectParams: [] as unknown[],
  initParams: [] as unknown[],
  epochMismatch: false,
}));

vi.mock("@/lib/features/code/worker-client", () => ({
  WorkerClient: class {
    async initializeSession(params: unknown) {
      mockState.initParams.push(params);
      return { sessionId: "stub-session", piSessionId: "stub-pi-session" };
    }
    async connectToSession(params: unknown) {
      mockState.connectParams.push(params);
      if (mockState.epochMismatch) {
        throw new Error("Cursor epoch mismatch");
      }
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

function makeRequest(forwardedProps?: { afterSeq?: number; epoch?: string }) {
  return new Request("http://test/api/agent/code/connect", {
    method: "POST",
    body: JSON.stringify({
      threadId: "t1",
      runId: "connect-run",
      context: [
        { description: "project", value: "p" },
        { description: "sessionId", value: "s" },
      ],
      forwardedProps: forwardedProps ?? { afterSeq: 0, epoch: "worker-epoch" },
      messages: [],
    }),
  });
}

async function parseJsonBody(res: Response) {
  return JSON.parse(await res.text()) as { error: string };
}

beforeEach(() => {
  mockState.events = [];
  mockState.connectParams = [];
  mockState.initParams = [];
  mockState.epochMismatch = false;
});

describe("POST /api/agent/code/connect", () => {
  it("emits a synthetic RUN_STARTED, relays logged AG-UI events, and advances cursor", async () => {
    // A cursor only ever comes from getSessionSnapshot, whose seq always
    // points past any run-start artifacts, so the worker's replay never
    // contains a RUN_STARTED or MESSAGES_SNAPSHOT for the client to skip.
    mockState.events = [
      {
        epoch: "worker-epoch",
        seq: 8,
        event: {
          type: EventType.TEXT_MESSAGE_CHUNK,
          messageId: "m1",
          role: "assistant",
          delta: "hello",
        },
      },
      {
        epoch: "worker-epoch",
        seq: 9,
        event: {
          type: EventType.RUN_FINISHED,
          threadId: "s",
          runId: "worker-run",
        },
      },
    ];

    const res = await POST(
      makeRequest({ afterSeq: 7, epoch: "worker-epoch" }) as never,
    );
    expect(res.status).toBe(200);

    const events = parseSseEvents(await res.text());

    expect(mockState.connectParams[0]).toEqual(
      expect.objectContaining({ sessionId: "s", afterSeq: 7, epoch: "worker-epoch" }),
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
        type: EventType.TEXT_MESSAGE_CHUNK,
        messageId: "m1",
        delta: "hello",
      }),
    );
    expect(events[2]).toEqual(
      expect.objectContaining({
        type: EventType.CUSTOM,
        name: CODING_AGENT_CURSOR_EVENT,
        value: { seq: 8, epoch: "worker-epoch" },
      }),
    );
    expect(events[3]).toEqual(
      expect.objectContaining({
        type: EventType.CUSTOM,
        name: CODING_AGENT_CURSOR_EVENT,
        value: { seq: 9, epoch: "worker-epoch", terminal: true },
      }),
    );
    expect(events[4]).toEqual(
      expect.objectContaining({
        type: EventType.RUN_FINISHED,
        threadId: "s",
        runId: "worker-run",
      }),
    );
    expect(events[5]).toBeUndefined();
  });

  it("finishes the synthetic connect run when worker has no events to replay", async () => {
    const res = await POST(makeRequest() as never);
    const events = parseSseEvents(await res.text());

    expect(events.map((e) => e.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.RUN_FINISHED,
    ]);
  });

  it("never forwards a modelId when initializing the session on connect", async () => {
    // Reconnecting a stream must not change the session's model: the worker
    // keeps (or restores from the Pi session file) the model already in use.
    const res = await POST(makeRequest() as never);
    await res.text();

    expect(mockState.initParams).toHaveLength(1);
    expect(mockState.initParams[0]).not.toHaveProperty("modelId");
  });

  it("returns 400 when afterSeq is missing", async () => {
    const res = await POST(makeRequest({ epoch: "worker-epoch" }) as never);

    expect(res.status).toBe(400);
    expect(await parseJsonBody(res)).toEqual({ error: "afterSeq is required" });
  });

  it("returns 400 when epoch is missing", async () => {
    const res = await POST(makeRequest({ afterSeq: 0 }) as never);

    expect(res.status).toBe(400);
    expect(await parseJsonBody(res)).toEqual({ error: "epoch is required" });
  });

  it("returns 409 when the worker reports a cursor epoch mismatch", async () => {
    mockState.epochMismatch = true;

    const res = await POST(
      makeRequest({ afterSeq: 0, epoch: "stale-epoch" }) as never,
    );

    expect(res.status).toBe(409);
  });
});
