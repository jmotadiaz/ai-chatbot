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

const { handleRpc } = await import("../../src/transports/http");
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
      cancelled?: boolean;
      cleared?: { steering: string[]; followUp: string[] };
    };
    error?: { code: number; message: string };
  };
}

function seedCancellableSession(sessionId: string) {
  const session = {
    isStreaming: true,
    abort: vi.fn(async () => {}),
    clearQueue: vi.fn(() => ({ steering: [], followUp: ["also fix the typo"] })),
  };
  sessionRegistry.set(sessionId, {
    sessionId,
    project: "p",
    runtime: { session } as never,
    activeRun: {
      runId: "r1",
      startSeq: 1,
      unsubscribe: () => {},
      sawTerminal: false,
    },
  } as never);
  return { session };
}

describe("cancelRun RPC (ticket 03)", () => {
  it("aborts and reports the drained queue for the draft", async () => {
    const { session } = seedCancellableSession("s-cancel");
    const body = await rpc("cancelRun", { sessionId: "s-cancel" });

    expect(body.error).toBeUndefined();
    expect(body.result).toEqual({
      cancelled: true,
      cleared: { steering: [], followUp: ["also fix the typo"] },
    });
    expect(session.clearQueue).toHaveBeenCalledTimes(1);
    expect(session.abort).toHaveBeenCalledTimes(1);
  });

  it("reports a missing session as not cancelled with an empty drain", async () => {
    const body = await rpc("cancelRun", { sessionId: "nope" });

    expect(body.error).toBeUndefined();
    expect(body.result).toEqual({
      cancelled: false,
      cleared: { steering: [], followUp: [] },
    });
  });
});
