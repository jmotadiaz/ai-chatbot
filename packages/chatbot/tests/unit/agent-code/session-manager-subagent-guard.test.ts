import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
  getTraceLogger: () => ({
    info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
    startTimer: () => () => {},
  }),
}));

const {
  getSessionSnapshot,
  getSessionStatus,
  getSessionMessages,
  __resetSessionsForTests,
  __seedSessionForTests,
} = await import("coding-agent/session-manager");
const { SessionEventLog } = await import("coding-agent/event-log");

function seedChild(parentSessionId: string) {
  __seedSessionForTests("child-1", {
    sessionId: "child-1",
    piSessionId: "pi-child-1",
    project: "proj",
    parentSessionId,
    runtime: { session: { messages: [], isStreaming: false } },
    eventLog: new SessionEventLog(),
  } as never);
}

beforeEach(() => __resetSessionsForTests());

describe("subagent session access guard", () => {
  it("rejects snapshot without parentSessionId", async () => {
    seedChild("parent-1");
    await expect(getSessionSnapshot("child-1")).rejects.toThrow(
      "Subagent session requires valid parent session id",
    );
  });

  it("rejects snapshot with wrong parentSessionId", async () => {
    seedChild("parent-1");
    await expect(getSessionSnapshot("child-1", undefined, undefined, "other")).rejects.toThrow(
      "Subagent session requires valid parent session id",
    );
  });

  it("serves snapshot with the correct parentSessionId", async () => {
    seedChild("parent-1");
    const snap = await getSessionSnapshot("child-1", undefined, undefined, "parent-1");
    expect(snap.running).toBe(false);
  });

  it("rejects status and messages without parentSessionId", async () => {
    seedChild("parent-1");
    await expect(getSessionStatus("child-1")).rejects.toThrow(
      "Subagent session requires valid parent session id",
    );
    await expect(getSessionMessages("child-1")).rejects.toThrow(
      "Subagent session requires valid parent session id",
    );
  });

  it("normal sessions ignore the param", async () => {
    __seedSessionForTests("normal-1", {
      sessionId: "normal-1", piSessionId: "pi-normal-1", project: "proj",
      runtime: { session: { messages: [], isStreaming: false } },
      eventLog: new SessionEventLog(),
    } as never);
    const status = await getSessionStatus("normal-1", "anything");
    expect(status.running).toBe(false);
  });
});
