import { describe, it, expect } from "vitest";
import type { Message, ToolCall } from "@ag-ui/client";
import { groupItems } from "@/lib/features/code/group-items";

function userMsg(id: string, content = "hi"): Message {
  return { id, role: "user", content } as Message;
}
function assistantMsg(id: string, toolCalls: ToolCall[] = []): Message {
  return { id, role: "assistant", content: "", toolCalls } as Message;
}
function toolMsg(id: string, toolCallId: string, content: string): Message {
  return { id, role: "tool", toolCallId, content } as Message;
}
function bashCall(id: string, cmd: string): ToolCall {
  return {
    id,
    type: "function",
    function: { name: "bash", arguments: JSON.stringify({ command: cmd }) },
  } as ToolCall;
}

describe("groupItems", () => {
  it("returns empty for empty input", () => {
    expect(groupItems([])).toEqual([]);
  });

  it("emits user and assistant items in order without tool calls", () => {
    const items = groupItems([userMsg("u1"), assistantMsg("a1")]);
    expect(items.map((i) => i.kind)).toEqual(["user", "assistant"]);
    if (items[1].kind === "assistant") {
      expect(items[1].toolGroups).toEqual([]);
    }
  });

  it("pairs a tool result with its toolCallId into the matching group", () => {
    const items = groupItems([
      assistantMsg("a1", [bashCall("t1", "ls")]),
      toolMsg("r1", "t1", "file.txt\n"),
    ]);
    if (items[0].kind !== "assistant") throw new Error("expected assistant");
    const g = items[0].toolGroups[0];
    expect(g.id).toBe("t1");
    expect(g.name).toBe("bash");
    expect(g.summary).toBe("ls");
    expect(g.result).toBe("file.txt\n");
    expect(g.status).toBe("ok");
    // No toolTimings were provided, so finishedAt must stay undefined rather
    // than being fabricated with Date.now() (that fabrication broke memo
    // stability across rebuilds).
    expect(g.finishedAt).toBeUndefined();
  });

  it("marks status error when toolErrors contains the toolCallId", () => {
    const items = groupItems(
      [
        assistantMsg("a1", [bashCall("t1", "false")]),
        toolMsg("r1", "t1", "exit 1"),
      ],
      new Map([["t1", true]]),
    );
    if (items[0].kind !== "assistant") throw new Error("expected assistant");
    expect(items[0].toolGroups[0].status).toBe("error");
  });

  it("drops orphan tool messages and keeps the assistant intact", () => {
    const items = groupItems([
      assistantMsg("a1", [bashCall("t1", "ls")]),
      toolMsg("r1", "orphan", "x"),
    ]);
    if (items[0].kind !== "assistant") throw new Error("expected assistant");
    expect(items[0].toolGroups).toHaveLength(1);
    expect(items[0].toolGroups[0].result).toBeUndefined();
  });

  it("preserves toolGroups order from the assistant message", () => {
    const t1 = bashCall("t1", "ls");
    const t2 = bashCall("t2", "pwd");
    const items = groupItems([
      assistantMsg("a1", [t1, t2]),
      toolMsg("r2", "t2", "/home"),
      toolMsg("r1", "t1", "a.txt\n"),
    ]);
    if (items[0].kind !== "assistant") throw new Error("expected assistant");
    expect(items[0].toolGroups.map((g) => g.id)).toEqual(["t1", "t2"]);
  });

  it("flushes a trailing assistant at the end of the stream", () => {
    const items = groupItems([
      userMsg("u1"),
      assistantMsg("a1", [bashCall("t1", "ls")]),
    ]);
    expect(items.map((i) => i.kind)).toEqual(["user", "assistant"]);
  });

  it("passes reasoning messages through without touching tool groups", () => {
    const reasoning = {
      id: "r0",
      role: "reasoning",
      content: "thinking...",
    } as Message;
    const items = groupItems([userMsg("u1"), reasoning, assistantMsg("a1")]);
    expect(items.map((i) => i.kind)).toEqual([
      "user",
      "reasoning",
      "assistant",
    ]);
  });

  it("pairs tool results by id even when reasoning appears between the assistant and result", () => {
    const reasoning = {
      id: "r0",
      role: "reasoning",
      content: "thinking...",
    } as Message;
    const items = groupItems([
      assistantMsg("a1", [bashCall("t1", "ls")]),
      reasoning,
      toolMsg("r1", "t1", "file.txt\n"),
    ]);

    if (items[0].kind !== "assistant") throw new Error("expected assistant");
    expect(items[0].toolGroups[0].result).toBe("file.txt\n");
    expect(items[0].toolGroups[0].status).toBe("ok");
    expect(items[1].kind).toBe("reasoning");
  });

  it("marks a tool as finished when STEP timing finished even if the tool result is not adjacent yet", () => {
    const items = groupItems(
      [assistantMsg("a1", [bashCall("t1", "ls")])],
      undefined,
      new Map([["t1", { startedAt: 100, finishedAt: 200 }]]),
    );

    if (items[0].kind !== "assistant") throw new Error("expected assistant");
    expect(items[0].toolGroups[0]).toEqual(
      expect.objectContaining({
        status: "ok",
        startedAt: 100,
        finishedAt: 200,
      }),
    );
  });

  it("marks every historical tool group ok/error (never running) when loaded from history with no timings", () => {
    // Simulates a page refresh: messages come straight from history, so
    // toolTimings is empty/undefined for all of them, but the tool results
    // are present in the message list.
    const messages = [
      assistantMsg("a1", [bashCall("t1", "ls"), bashCall("t2", "false")]),
      toolMsg("r1", "t1", "file.txt\n"),
      toolMsg("r2", "t2", "exit 1"),
    ];
    const items = groupItems(messages, new Map([["t2", true]]), undefined);

    if (items[0].kind !== "assistant") throw new Error("expected assistant");
    const [g1, g2] = items[0].toolGroups;
    expect(g1.status).toBe("ok");
    expect(g1.startedAt).toBeUndefined();
    expect(g1.finishedAt).toBeUndefined();
    expect(g2.status).toBe("error");
    expect(g2.startedAt).toBeUndefined();
    expect(g2.finishedAt).toBeUndefined();
  });

  it("leaves a genuinely in-flight tool call (no timing, no result yet) as running", () => {
    const items = groupItems([assistantMsg("a1", [bashCall("t1", "ls")])]);
    if (items[0].kind !== "assistant") throw new Error("expected assistant");
    expect(items[0].toolGroups[0].status).toBe("running");
  });

  it("is memo-stable: identical inputs produce field-equal groups across two calls", () => {
    const messages = [
      userMsg("u1"),
      assistantMsg("a1", [bashCall("t1", "ls"), bashCall("t2", "pwd")]),
      toolMsg("r1", "t1", "file.txt\n"),
      toolMsg("r2", "t2", "/home"),
    ];
    // No toolTimings at all, mirroring a conversation loaded from history.
    const first = groupItems(messages, undefined, undefined);
    const second = groupItems(messages, undefined, undefined);

    const firstAssistant = first[1];
    const secondAssistant = second[1];
    if (firstAssistant.kind !== "assistant" || secondAssistant.kind !== "assistant") {
      throw new Error("expected assistant");
    }

    expect(firstAssistant.toolGroups).toHaveLength(secondAssistant.toolGroups.length);
    firstAssistant.toolGroups.forEach((g1, i) => {
      const g2 = secondAssistant.toolGroups[i];
      // These are exactly the fields the memo comparators in
      // agent-message.tsx / tool-call-group.tsx compare with === / !==.
      expect(g1.id).toBe(g2.id);
      expect(g1.name).toBe(g2.name);
      expect(g1.status).toBe(g2.status);
      expect(g1.result).toBe(g2.result);
      expect(g1.startedAt).toBe(g2.startedAt);
      expect(g1.finishedAt).toBe(g2.finishedAt);
      expect(g1.summary).toBe(g2.summary);
      expect(g1.args).toBe(g2.args);
    });
  });
});
