import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  setSubagentRunner,
  type SubagentRunner,
} from "../../../../coding-agent/src/subagent-bridge";

const RUNNER_KEY = Symbol.for("codingAgent.subagentRunner");

type ToolExecute = (
  toolCallId: string,
  params: Record<string, unknown>,
  signal: AbortSignal | undefined,
  onUpdate: undefined,
  ctx: { sessionManager: { getSessionId: () => string } },
) => Promise<{
  content: Array<{ type: string; text: string }>;
  details: Record<string, unknown>;
  isError?: boolean;
}>;

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

const { buildSubagentToolDescription } = await import(
  "../../../../coding-agent/extensions/subagent/description"
);
const registerExtension = (await import(
  "../../../../coding-agent/extensions/subagent/index"
)).default;

beforeEach(() => {
  delete (globalThis as Record<symbol, unknown>)[RUNNER_KEY];
});

describe("subagent extension", () => {
  it("description lists available models and reserved agent param", () => {
    const d = buildSubagentToolDescription(["opencode-go/kimi-k2"]);
    expect(d).toContain("opencode-go/kimi-k2");
    expect(d).toContain("agent");
  });

  it("registers a tool named subagent", async () => {
    const tools: Array<{ name: string }> = [];
    registerExtension({ registerTool: (t: never) => tools.push(t) } as never);
    expect(tools.map((t) => t.name)).toEqual(["subagent"]);
  });

  it("dispatches through the runner published on globalThis", async () => {
    const calls: Array<{ parentPiSessionId: string; toolCallId: string }> = [];
    const stub: SubagentRunner = async (parentPiSessionId, toolCallId) => {
      calls.push({ parentPiSessionId, toolCallId });
      return {
        content: [{ type: "text", text: "done" }],
        details: {
          subSessionId: "sub-1",
          subPiSessionId: "pi-sub-1",
          parentSessionId: "parent-1",
          parentToolCallId: toolCallId,
        },
      };
    };
    setSubagentRunner(stub);

    let tool: { execute: ToolExecute } | undefined;
    registerExtension({ registerTool: (t: never) => { tool = t; } } as never);
    const result = await tool!.execute(
      "tc-1",
      { task: "do x" },
      undefined,
      undefined,
      { sessionManager: { getSessionId: () => "pi-parent" } },
    );

    expect(calls).toEqual([{ parentPiSessionId: "pi-parent", toolCallId: "tc-1" }]);
    expect(result.isError).toBeUndefined();
    expect(result.details.subSessionId).toBe("sub-1");
  });

  it("reports an error when the worker published no runner", async () => {
    let tool: { execute: ToolExecute } | undefined;
    registerExtension({ registerTool: (t: never) => { tool = t; } } as never);
    const result = await tool!.execute(
      "tc-1",
      { task: "do x" },
      undefined,
      undefined,
      { sessionManager: { getSessionId: () => "pi-parent" } },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("runner unavailable");
  });

  it("returns an error when the reserved agent param is used", async () => {
    let tool: { execute: ToolExecute } | undefined;
    registerExtension({ registerTool: (t: never) => { tool = t; } } as never);
    const result = await tool!.execute(
      "tc-1",
      { task: "do x", agent: "scout" },
      undefined,
      undefined,
      { sessionManager: { getSessionId: () => "pi-parent" } },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("reserved");
  });
});
