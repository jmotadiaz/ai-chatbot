import { describe, it, expect, vi } from "vitest";

vi.mock("tracing", () => ({
  isTracingEnabled: () => false,
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

  it("returns an error when the reserved agent param is used", async () => {
    let tool: { execute: Function } | undefined;
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
