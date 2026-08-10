import { describe, it, expect, vi, beforeEach } from "vitest";

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

const {
  getSubagentSessionForToolCall,
  __resetSessionsForTests,
  __seedSessionForTests,
} = await import("../../src/session-manager");
const { SessionEventLog } = await import("../../src/event-log");

beforeEach(() => __resetSessionsForTests());

function seedParentWithToolResult() {
  __seedSessionForTests("parent-1", {
    sessionId: "parent-1", piSessionId: "pi-parent-1", project: "proj",
    runtime: {
      session: {
        isStreaming: false,
        messages: [
          { role: "toolResult", toolCallId: "tc-9", content: "done",
            details: { subSessionId: "child-9", subPiSessionId: "pi-child-9" } },
        ],
      },
    },
    eventLog: new SessionEventLog(),
  } as never);
}

describe("getSubagentSessionForToolCall", () => {
  it("resolves from the in-memory map when registered", async () => {
    seedParentWithToolResult();
    __seedSessionForTests("child-9", {
      sessionId: "child-9", piSessionId: "pi-child-9", project: "proj",
      parentSessionId: "parent-1", parentToolCallId: "tc-9",
      runtime: { session: { messages: [], isStreaming: false } },
      eventLog: new SessionEventLog(),
    } as never);
    const r = await getSubagentSessionForToolCall("parent-1", "tc-9");
    expect(r).toEqual({ subSessionId: "child-9", subPiSessionId: "pi-child-9" });
  });

  it("throws for an unknown toolCallId", async () => {
    seedParentWithToolResult();
    await expect(getSubagentSessionForToolCall("parent-1", "tc-nope")).rejects.toThrow(
      "Subagent session not found for tool call",
    );
  });

  it("throws when the parent session does not exist", async () => {
    await expect(getSubagentSessionForToolCall("nope", "tc-9")).rejects.toThrow();
  });
});
