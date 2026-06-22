import { describe, it, expect, vi } from "vitest";

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

vi.mock("@/lib/features/code/worker-client", () => {
  const encoder = new TextEncoder();
  return {
    WorkerClient: class {
      baseUrl = "";
      id = 0;
      async initializeSession() {
        return { sessionId: "stub-session", piSessionId: "stub-pi-session" };
      }
      async connectToSession() {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: "snapshot",
                  messages: [{ id: "m1", role: "user", content: "hello" }],
                  inFlight: [
                    { toolCallId: "t1", name: "bash", argsSoFar: '{"c' },
                  ],
                }) + "\n",
              ),
            );
            controller.enqueue(
              encoder.encode(JSON.stringify({ type: "agent_start" }) + "\n"),
            );
            controller.enqueue(
              encoder.encode(JSON.stringify({ type: "agent_end" }) + "\n"),
            );
            controller.close();
          },
        });
        return stream;
      }
    },
  };
});

import { POST } from "@/app/(chat)/api/agent/code/connect/route";

function parseSseEvents(text: string): Array<{ type: string; [k: string]: unknown }> {
  return text
    .split("\n\n")
    .filter((s) => s.startsWith("data: "))
    .map((s) => JSON.parse(s.replace(/^data: /, "")) as { type: string; [k: string]: unknown });
}

describe("POST /api/agent/code/connect", () => {
  it("emits MESSAGES_SNAPSHOT before live events", async () => {
    const req = new Request("http://test/api/agent/code/connect", {
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

    const res = await POST(req as never);
    expect(res.status).toBe(200);

    const events = parseSseEvents(await res.text());

    expect(events[0].type).toBe("MESSAGES_SNAPSHOT");
    expect(events[0].messages).toEqual([
      { id: "m1", role: "user", content: "hello" },
    ]);
    expect(events[1].type).toBe("TOOL_CALL_START");
    expect(events[1].toolCallId).toBe("t1");
    expect(events[1].toolCallName).toBe("bash");
    expect(events[2].type).toBe("TOOL_CALL_ARGS");
    expect(events[2].toolCallId).toBe("t1");
    expect(events[2].delta).toBe('{"c');
    expect(events[3].type).toBe("RUN_STARTED");
    expect(events[4].type).toBe("RUN_FINISHED");
  });
});
