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
    result?: { queued?: boolean; pending?: { steering: string[]; followUp: string[] } };
    error?: { code: number; message: string };
  };
}

function seedFollowUpSession(
  sessionId: string,
  opts?: { running?: boolean; steering?: string[]; followUp?: string[] },
) {
  const steeringMessages: string[] = [...(opts?.steering ?? [])];
  const followUpMessages: string[] = [...(opts?.followUp ?? [])];
  const session = {
    isStreaming: opts?.running ?? true,
    followUp: vi.fn(async (text: string) => {
      followUpMessages.push(text);
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
  return { session, followUpMessages };
}

describe("followUp RPC", () => {
  it("rejects a request without sessionId and text", async () => {
    const body = await rpc("followUp", {});
    expect(body.error).toEqual({
      code: -32602,
      message: "sessionId and text are required",
    });
  });

  it("rejects an empty follow-up without touching the session", async () => {
    const { session } = seedFollowUpSession("s-empty");
    const body = await rpc("followUp", { sessionId: "s-empty", text: "   " });
    expect(body.error?.code).toBe(-32603);
    expect(body.error?.message).toMatch("non-empty");
    expect(session.followUp).not.toHaveBeenCalled();
  });

  it("rejects extension commands fail-fast", async () => {
    const { session } = seedFollowUpSession("s-cmd");
    const body = await rpc("followUp", { sessionId: "s-cmd", text: "/compact now" });
    expect(body.error?.code).toBe(-32603);
    expect(session.followUp).not.toHaveBeenCalled();
  });

  it("rejects skill commands fail-fast", async () => {
    const { session } = seedFollowUpSession("s-skill");
    const body = await rpc("followUp", {
      sessionId: "s-skill",
      text: "/skill:code-review check this",
    });
    expect(body.error?.code).toBe(-32603);
    expect(session.followUp).not.toHaveBeenCalled();
  });

  it("rejects an unknown session", async () => {
    const body = await rpc("followUp", { sessionId: "nope", text: "hello" });
    expect(body.error).toEqual({ code: -32603, message: "Session not found" });
  });

  it("rejects queueing while no turn is running", async () => {
    const { session } = seedFollowUpSession("s-idle", { running: false });
    const body = await rpc("followUp", { sessionId: "s-idle", text: "hello" });
    expect(body.error?.code).toBe(-32603);
    expect(body.error?.message).toMatch("no turn is running");
    expect(session.followUp).not.toHaveBeenCalled();
  });

  it("rejects turn config travelling with the queue operation", async () => {
    const { session } = seedFollowUpSession("s-config");
    const body = await rpc("followUp", {
      sessionId: "s-config",
      text: "hello",
      modelId: "some/model",
    });
    expect(body.error?.code).toBe(-32602);
    expect(session.followUp).not.toHaveBeenCalled();
  });

  it("enqueues plain text and reports the pending queue", async () => {
    const { session } = seedFollowUpSession("s-ok");
    const body = await rpc("followUp", { sessionId: "s-ok", text: "also fix the typo" });
    expect(body.error).toBeUndefined();
    expect(session.followUp).toHaveBeenCalledWith("also fix the typo");
    expect(body.result).toEqual({
      queued: true,
      pending: { steering: [], followUp: ["also fix the typo"] },
    });
  });
});

describe("followUp single pending (US7)", () => {
  it("rejects with a 409 conflict when a follow-up is already armed", async () => {
    const { session } = seedFollowUpSession("s-busy-fu", {
      followUp: ["first instruction"],
    });
    const body = await rpc("followUp", {
      sessionId: "s-busy-fu",
      text: "second instruction",
    });
    expect(body.result).toBeUndefined();
    expect(body.error?.code).toBe(409);
    expect(body.error?.message).toMatch(/already pending/);
    expect(session.followUp).not.toHaveBeenCalled();
  });

  it("rejects with a 409 conflict when steering is already armed", async () => {
    const { session } = seedFollowUpSession("s-busy-st", {
      steering: ["promoted instruction"],
    });
    const body = await rpc("followUp", {
      sessionId: "s-busy-st",
      text: "second instruction",
    });
    expect(body.result).toBeUndefined();
    expect(body.error?.code).toBe(409);
    expect(body.error?.message).toMatch(/already pending/);
    expect(session.followUp).not.toHaveBeenCalled();
  });
});

describe("summarizeRpcParams (followUp)", () => {
  it("exposes only the text length, never the text", () => {
    const summary = summarizeRpcParams("followUp", {
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
});
