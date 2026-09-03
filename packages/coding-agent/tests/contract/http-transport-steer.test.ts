import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  acquireTraceSink: async () => null,
  releaseTraceSink: async () => {},
  retainTraceSink: () => async () => {},
  setTraceSessionId: () => {},
  getTraceLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    startTimer: () => () => {},
  }),
}));

const { handleRpc, summarizeRpcParams } = await import("../../src/transports/http");
import { sessionRegistry } from "../../src/session/session-registry";

beforeEach(() => {
  sessionRegistry.clear();
});

async function rpc(method: string, params: unknown) {
  const res = await handleRpc(
    JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
  );
  return (await res.json()) as {
    result?: {
      steered?: boolean;
      cleared?: { steering: string[]; followUp: string[] };
      pending?: { steering: string[]; followUp: string[] };
    };
    error?: { code: number; message: string };
  };
}

/**
 * Live-session double with both queues and call-order tracking. Real Pi
 * emits queue_update through the collector subscription; here the pending
 * return value is the observable seam (the translator suite covers the
 * event mapping, the turn-runner suite covers delivery inside the turn).
 */
function seedQueueSession(
  sessionId: string,
  opts?: { running?: boolean; steering?: string[]; followUp?: string[] },
) {
  const steeringMessages: string[] = [...(opts?.steering ?? [])];
  const followUpMessages: string[] = [...(opts?.followUp ?? [])];
  const callOrder: string[] = [];
  const session = {
    isStreaming: opts?.running ?? true,
    steer: vi.fn(async (text: string) => {
      callOrder.push("steer");
      steeringMessages.push(text);
    }),
    followUp: vi.fn(async (text: string) => {
      callOrder.push("followUp");
      followUpMessages.push(text);
    }),
    clearQueue: vi.fn(() => {
      callOrder.push("clearQueue");
      const cleared = {
        steering: [...steeringMessages],
        followUp: [...followUpMessages],
      };
      steeringMessages.length = 0;
      followUpMessages.length = 0;
      return cleared;
    }),
    getSteeringMessages: () => [...steeringMessages],
    getFollowUpMessages: () => [...followUpMessages],
  };
  sessionRegistry.set(sessionId, {
    sessionId,
    project: "p",
    runtime: { session } as never,
    ...(opts?.running === false
      ? {}
      : {
          activeRun: {
            runId: "r1",
            startSeq: 1,
            unsubscribe: () => {},
            sawTerminal: false,
          },
        }),
  } as never);
  return { session, steeringMessages, followUpMessages, callOrder };
}

describe("clearQueue RPC", () => {
  it("rejects a request without a sessionId", async () => {
    const body = await rpc("clearQueue", {});
    expect(body.error).toEqual({
      code: -32602,
      message: "sessionId is required",
    });
  });

  it("rejects an unknown session", async () => {
    const body = await rpc("clearQueue", { sessionId: "nope" });
    expect(body.error).toEqual({ code: -32603, message: "Session not found" });
  });

  it("discards both queues and reports what was removed", async () => {
    const { session } = seedQueueSession("s-clear", {
      followUp: ["also fix the typo"],
      steering: ["steer me"],
    });
    const body = await rpc("clearQueue", { sessionId: "s-clear" });
    expect(body.error).toBeUndefined();
    expect(session.clearQueue).toHaveBeenCalledTimes(1);
    expect(body.result).toEqual({
      cleared: { steering: ["steer me"], followUp: ["also fix the typo"] },
      pending: { steering: [], followUp: [] },
    });
  });

  it("succeeds idempotently on an empty queue", async () => {
    seedQueueSession("s-empty");
    const body = await rpc("clearQueue", { sessionId: "s-empty" });
    expect(body.error).toBeUndefined();
    expect(body.result).toEqual({
      cleared: { steering: [], followUp: [] },
      pending: { steering: [], followUp: [] },
    });
  });
});

describe("steer RPC (promotion)", () => {
  it("rejects a request without sessionId and text", async () => {
    const body = await rpc("steer", {});
    expect(body.error).toEqual({
      code: -32602,
      message: "sessionId and text are required",
    });
  });

  it("rejects an empty steer without touching the session", async () => {
    const { session, callOrder } = seedQueueSession("s-steer-empty");
    const body = await rpc("steer", { sessionId: "s-steer-empty", text: "   " });
    expect(body.error?.code).toBe(-32603);
    expect(body.error?.message).toMatch("non-empty");
    expect(session.steer).not.toHaveBeenCalled();
    expect(callOrder).toEqual([]);
  });

  it("rejects extension commands fail-fast", async () => {
    const { session } = seedQueueSession("s-steer-cmd");
    const body = await rpc("steer", { sessionId: "s-steer-cmd", text: "/compact now" });
    expect(body.error?.code).toBe(-32603);
    expect(session.steer).not.toHaveBeenCalled();
  });

  it("rejects skill commands fail-fast", async () => {
    const { session } = seedQueueSession("s-steer-skill");
    const body = await rpc("steer", {
      sessionId: "s-steer-skill",
      text: "/skill:code-review check this",
    });
    expect(body.error?.code).toBe(-32603);
    expect(session.steer).not.toHaveBeenCalled();
  });

  it("rejects an unknown session", async () => {
    const body = await rpc("steer", { sessionId: "nope", text: "hello" });
    expect(body.error).toEqual({ code: -32603, message: "Session not found" });
  });

  it("rejects steering while no turn is running", async () => {
    const { session } = seedQueueSession("s-steer-idle", { running: false });
    const body = await rpc("steer", { sessionId: "s-steer-idle", text: "hello" });
    expect(body.error?.code).toBe(-32603);
    expect(body.error?.message).toMatch("no turn is running");
    expect(session.steer).not.toHaveBeenCalled();
  });

  it("rejects turn config travelling with the queue operation", async () => {
    const { session } = seedQueueSession("s-steer-config");
    const body = await rpc("steer", {
      sessionId: "s-steer-config",
      text: "hello",
      thinkingLevel: "high",
    });
    expect(body.error?.code).toBe(-32602);
    expect(session.steer).not.toHaveBeenCalled();
  });

  it("promotes clear-then-enqueue in that order, exactly once", async () => {
    const { session, steeringMessages, followUpMessages, callOrder } =
      seedQueueSession("s-promote", { followUp: ["also fix the typo"] });
    const body = await rpc("steer", {
      sessionId: "s-promote",
      text: "also fix the typo",
    });
    expect(body.error).toBeUndefined();
    // The regression trap: steer without clear would leave the follow-up
    // armed AND push a steering copy (double execution, double LLM cost).
    expect(callOrder).toEqual(["clearQueue", "steer"]);
    expect(session.steer).toHaveBeenCalledTimes(1);
    expect(session.steer).toHaveBeenCalledWith("also fix the typo");
    expect(steeringMessages).toEqual(["also fix the typo"]);
    expect(followUpMessages).toEqual([]);
    expect(body.result).toEqual({
      steered: true,
      cleared: { steering: [], followUp: ["also fix the typo"] },
      pending: { steering: ["also fix the typo"], followUp: [] },
    });
  });
});

describe("summarizeRpcParams (steer/clearQueue)", () => {
  it("exposes only the text length for steer, never the text", () => {
    const summary = summarizeRpcParams("steer", {
      sessionId: "s1",
      text: "super secret instruction",
    });
    expect(summary).toEqual({
      sessionId: "s1",
      textLength: 24,
      hasTraceRunId: false,
    });
    expect(JSON.stringify(summary)).not.toContain("super secret");
  });

  it("exposes only the session id for clearQueue", () => {
    expect(summarizeRpcParams("clearQueue", { sessionId: "s1" })).toEqual({
      sessionId: "s1",
      hasTraceRunId: false,
    });
  });
});
