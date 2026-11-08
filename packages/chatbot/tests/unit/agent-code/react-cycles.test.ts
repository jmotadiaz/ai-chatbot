import { describe, it, expect } from "vitest";
import type { Message, ToolCall } from "@ag-ui/client";
import { groupItems } from "@/lib/features/code/group-items";
import {
  buildConversationBlocks,
  describeReActCycle,
  type ReActCycle,
} from "@/lib/features/code/react-cycles";
import type { ToolCallGroup } from "@/lib/features/code/types";

function userMsg(id: string, content = "hi"): Message {
  return { id, role: "user", content } as Message;
}
function reasoningMsg(id: string, content = "let me think"): Message {
  return { id, role: "reasoning", content } as Message;
}
function assistantMsg(
  id: string,
  content = "",
  toolCalls: ToolCall[] = [],
): Message {
  return { id, role: "assistant", content, toolCalls } as Message;
}
function bashCall(id: string, cmd: string): ToolCall {
  return {
    id,
    type: "function",
    function: { name: "bash", arguments: JSON.stringify({ command: cmd }) },
  } as ToolCall;
}
function subagentCall(id: string, description: string): ToolCall {
  return {
    id,
    type: "function",
    function: { name: "subagent", arguments: JSON.stringify({ description }) },
  } as ToolCall;
}

function toolGroup(
  id: string,
  name: string,
  overrides: Partial<ToolCallGroup> = {},
): ToolCallGroup {
  return {
    id,
    name,
    args: "{}",
    status: "ok",
    summary: id,
    ...overrides,
  };
}

function cycleOf(
  steps: Array<Partial<ToolCallGroup> & { id: string; name: string }>,
): ReActCycle {
  const groups = steps.map((step) => toolGroup(step.id, step.name, step));
  return {
    id: "cycle:x",
    originMessageId: "x",
    steps: groups.map((group) => ({ kind: "tool" as const, id: group.id, group })),
  };
}

describe("buildConversationBlocks", () => {
  it("returns no blocks for no items", () => {
    expect(buildConversationBlocks([])).toEqual([]);
  });

  it("emits a user block and an assistant response block", () => {
    const blocks = buildConversationBlocks(
      groupItems([userMsg("u1"), assistantMsg("a1", "done")]),
    );
    expect(blocks.map((b) => b.kind)).toEqual(["user", "response"]);
  });

  it("folds reasoning into the cycle that precedes the response", () => {
    const blocks = buildConversationBlocks(
      groupItems([userMsg("u1"), reasoningMsg("a1"), assistantMsg("a1", "done")]),
    );
    expect(blocks.map((b) => b.kind)).toEqual(["user", "cycle", "response"]);
    const cycle = blocks[1];
    if (cycle.kind !== "cycle") throw new Error("expected cycle");
    expect(cycle.cycle.steps.map((s) => s.kind)).toEqual(["reasoning"]);
  });

  it("keeps tool calls without text inside a cycle", () => {
    const blocks = buildConversationBlocks(
      groupItems([userMsg("u1"), assistantMsg("a1", "", [bashCall("t1", "ls")])]),
    );
    expect(blocks.map((b) => b.kind)).toEqual(["user", "cycle"]);
    const cycle = blocks[1];
    if (cycle.kind !== "cycle") throw new Error("expected cycle");
    expect(cycle.cycle.steps.map((s) => s.kind)).toEqual(["tool"]);
    expect(cycle.cycle.originMessageId).toBe("a1");
  });

  it("splits one assistant Message at its text: tools emitted with the text open the next cycle", () => {
    const blocks = buildConversationBlocks(
      groupItems([
        userMsg("u1"),
        reasoningMsg("a1"),
        assistantMsg("a1", "Checking the tests first.", [bashCall("t1", "pnpm test")]),
      ]),
    );
    expect(blocks.map((b) => b.kind)).toEqual(["user", "cycle", "response", "cycle"]);
    const [first, , second] = blocks.slice(1);
    if (first.kind !== "cycle" || second.kind !== "cycle") {
      throw new Error("expected cycles around the response");
    }
    expect(first.cycle.steps.map((s) => s.kind)).toEqual(["reasoning"]);
    expect(second.cycle.steps.map((s) => s.kind)).toEqual(["tool"]);
    // Both cycles keep their own identity: the second one is keyed by its own
    // opening message, not by the cycle that was just flushed.
    expect(first.id).not.toBe(second.id);
  });

  it("opens a new cycle after a response when the agent keeps working", () => {
    const blocks = buildConversationBlocks(
      groupItems([
        userMsg("u1"),
        reasoningMsg("a1"),
        assistantMsg("a1", "", [bashCall("t1", "ls")]),
        assistantMsg("a2", "I found the file."),
        reasoningMsg("a3"),
        assistantMsg("a3", "", [bashCall("t2", "cat x")]),
        assistantMsg("a4", "All done."),
      ]),
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      "user",
      "cycle",
      "response",
      "cycle",
      "response",
    ]);
  });

  it("drops empty reasoning messages instead of opening a cycle for them", () => {
    const blocks = buildConversationBlocks(
      groupItems([userMsg("u1"), reasoningMsg("a1", "   "), assistantMsg("a1", "ok")]),
    );
    expect(blocks.map((b) => b.kind)).toEqual(["user", "response"]);
  });

  it("anchors the cycle to the last assistant Message that contributed steps", () => {
    const blocks = buildConversationBlocks(
      groupItems([
        userMsg("u1"),
        reasoningMsg("a1"),
        assistantMsg("a1", "", [bashCall("t1", "ls")]),
        assistantMsg("a2", "", [bashCall("t2", "cat")]),
      ]),
    );
    const cycle = blocks[1];
    if (cycle.kind !== "cycle") throw new Error("expected cycle");
    expect(cycle.cycle.originMessageId).toBe("a2");
    expect(cycle.cycle.id).toBe("cycle:r:a1");
  });

  it("labels a real stream of parallel calls by tool type", () => {
    const blocks = buildConversationBlocks(
      groupItems([
        userMsg("u1"),
        assistantMsg("a1", "", [
          bashCall("t1", "pnpm --filter chatbot test:unit"),
          subagentCall("t2", "explore the grouping logic"),
          subagentCall("t3", "verify the E2E selectors"),
        ]),
      ]),
    );
    const cycle = blocks[1];
    if (cycle.kind !== "cycle") throw new Error("expected cycle");
    // No timings were recorded, so every call is still in flight.
    expect(describeReActCycle(cycle.cycle, true).label).toBe(
      "3 tools: Shell; Subagents",
    );
  });

  it("is stable across rebuilds of the same messages", () => {
    const messages = [
      userMsg("u1"),
      reasoningMsg("a1"),
      assistantMsg("a1", "", [bashCall("t1", "ls")]),
    ];
    const first = buildConversationBlocks(groupItems(messages));
    const second = buildConversationBlocks(groupItems(messages));
    expect(second.map((b) => b.id)).toEqual(first.map((b) => b.id));
  });
});

describe("describeReActCycle", () => {
  it("names the reasoning in flight while no tool is running", () => {
    const header = describeReActCycle(
      {
        id: "cycle:a1",
        originMessageId: "a1",
        steps: [{ kind: "reasoning", id: "a1", message: reasoningMsg("a1") }],
      },
      true,
    );
    expect(header.label).toBe("Thinking");
    expect(header.shimmer).toBe(true);
    expect(header.runningTools).toEqual([]);
  });

  it("names a single running tool with its summary", () => {
    const header = describeReActCycle(
      cycleOf([{ id: "t1", name: "bash", status: "running", summary: "pnpm test" }]),
      true,
    );
    expect(header.label).toBe("Shell pnpm test");
    expect(header.singleRunningTool).toEqual({
      name: "bash",
      summary: "pnpm test",
    });
    expect(header.shimmer).toBe(true);
  });

  it("counts parallel calls by type, pluralising repeated ones", () => {
    const header = describeReActCycle(
      cycleOf([
        { id: "t1", name: "bash", status: "running", summary: "pnpm test" },
        { id: "t2", name: "subagent", status: "running", summary: "explore" },
        { id: "t3", name: "subagent", status: "running", summary: "verify" },
      ]),
      true,
    );
    expect(header.label).toBe("3 tools: Shell; Subagents");
    expect(header.runningTools).toEqual(["Shell", "Subagent", "Subagent"]);
    expect(header.singleRunningTool).toBeUndefined();
  });

  it("shrinks the parallel label as calls finish", () => {
    const header = describeReActCycle(
      cycleOf([
        { id: "t1", name: "bash", status: "ok", summary: "pnpm test" },
        { id: "t2", name: "subagent", status: "running", summary: "explore" },
      ]),
      true,
    );
    expect(header.label).toBe("Subagent explore");
    expect(header.runningTools).toEqual(["Subagent"]);
  });

  it("reports what a finished cycle did", () => {
    const cycle: ReActCycle = {
      id: "cycle:a1",
      originMessageId: "a2",
      steps: [
        { kind: "reasoning", id: "a1", message: reasoningMsg("a1") },
        { kind: "reasoning", id: "a2", message: reasoningMsg("a2") },
        { kind: "tool", id: "t1", group: toolGroup("t1", "bash") },
        { kind: "tool", id: "t2", group: toolGroup("t2", "read") },
      ],
    };
    const header = describeReActCycle(cycle, false);
    expect(header.label).toBe("2 thoughts · 2 tools");
    expect(header.shimmer).toBe(false);
    expect(header.hasError).toBe(false);
  });

  it("omits the parts that are zero", () => {
    expect(
      describeReActCycle(
        {
          id: "cycle:a1",
          originMessageId: "a1",
          steps: [{ kind: "reasoning", id: "a1", message: reasoningMsg("a1") }],
        },
        false,
      ).label,
    ).toBe("1 thought");
    expect(
      describeReActCycle(cycleOf([{ id: "t1", name: "bash" }]), false).label,
    ).toBe("1 tool");
    expect(
      describeReActCycle(
        cycleOf([
          { id: "t1", name: "bash" },
          { id: "t2", name: "read" },
          { id: "t3", name: "edit" },
        ]),
        false,
      ).label,
    ).toBe("3 tools");
  });

  it("counts failed calls last and flags the cycle", () => {
    const header = describeReActCycle(
      {
        id: "cycle:a1",
        originMessageId: "a1",
        steps: [
          { kind: "reasoning", id: "a1", message: reasoningMsg("a1") },
          { kind: "tool", id: "t1", group: toolGroup("t1", "bash") },
          { kind: "tool", id: "t2", group: toolGroup("t2", "bash", { status: "error" }) },
        ],
      },
      false,
    );
    expect(header.label).toBe("1 thought · 2 tools · 1 error");
    expect(header.hasError).toBe(true);
  });
});
