import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOOL_PRUNING_CONFIG,
  MIN_TRUNCATION_CHARS,
  type AgentMessage,
  type AssistantMessage,
  type ToolResultMessage,
  type ToolPruningMaskMap,
} from "../../../src/pruning/config";
import { applyPruningMask, toolResultText } from "../../../src/pruning/mask";
import { assistant, call, toolResult, user } from "./fixtures";

/** A `read` call block; the mask only keys on the id. */
const toolCall = (id: string, name = "read") => call(id, name, { path: "src/app.ts" });

const text = (value: string): { type: "text"; text: string } => ({ type: "text", text: value });
const image = (): { type: "image"; data: string; mimeType: string } => ({
  type: "image",
  data: "AAAA",
  mimeType: "image/png",
});

const apply = (messages: AgentMessage[], masks: ToolPruningMaskMap): AgentMessage[] =>
  applyPruningMask(messages, masks, DEFAULT_TOOL_PRUNING_CONFIG);

/** 1000 characters: `h` * 150, `m` * 700, `t` * 150. */
const LONG_TEXT = `${"h".repeat(150)}${"m".repeat(700)}${"t".repeat(150)}`;

const STUB_MARKER = (omitted: number, toolName = "read"): string =>
  `… [Tool Pruning: omitted ${omitted} chars from ${toolName}; re-run or re-read if exact output is needed] …`;

describe("applyPruningMask", () => {
  it("returns the input untouched when there is no mask", () => {
    const messages: AgentMessage[] = [user("hello"), assistant([toolCall("a")]), toolResult("a", [text(LONG_TEXT)])];

    const projected = apply(messages, {});

    expect(projected).toEqual(messages);
    expect(projected[0]).toBe(messages[0]);
    expect(projected[1]).toBe(messages[1]);
    expect(projected[2]).toBe(messages[2]);
  });

  it("keeps the ToolCall block and rewrites only the result body on drop_result", () => {
    const call = toolCall("a");
    const result = toolResult("a", [text(LONG_TEXT)], {
      details: { path: "src/app.ts" },
      timestamp: 42,
    });
    const messages: AgentMessage[] = [assistant([call]), result];

    const projected = apply(messages, { a: "drop_result" });

    const projectedAssistant = projected[0] as AssistantMessage;
    expect(projectedAssistant).toBe(messages[0]);
    expect(projectedAssistant.content).toEqual([call]);

    const projectedResult = projected[1] as ToolResultMessage;
    expect(projectedResult).not.toBe(result);
    expect(projectedResult.role).toBe("toolResult");
    expect(projectedResult.toolCallId).toBe("a");
    expect(projectedResult.toolName).toBe("read");
    expect(projectedResult.isError).toBe(false);
    expect(projectedResult.timestamp).toBe(42);
    expect(projectedResult.details).toEqual({ path: "src/app.ts" });
    expect(projectedResult.content).toHaveLength(1);
  });

  it("builds the head + tail stub with the exact marker text", () => {
    const messages: AgentMessage[] = [assistant([toolCall("a")]), toolResult("a", [text(LONG_TEXT)])];

    const [projected] = apply(messages, { a: "drop_result" }).slice(1) as ToolResultMessage[];

    expect(projected.content).toEqual([
      text(`${"h".repeat(150)}\n${STUB_MARKER(700)}\n${"t".repeat(150)}`),
    ]);
  });

  it("never stubs a result at or below the minimum truncation size", () => {
    const atLimit = "x".repeat(MIN_TRUNCATION_CHARS);
    const shortMessages: AgentMessage[] = [
      assistant([toolCall("a"), toolCall("b")]),
      toolResult("a", [text(atLimit)]),
      toolResult("b", [text("x".repeat(MIN_TRUNCATION_CHARS + 1))]),
    ];

    const projected = apply(shortMessages, { a: "drop_result", b: "drop_result" });

    expect(projected[1]).toBe(shortMessages[1]);
    expect((projected[2] as ToolResultMessage).content).toEqual([
      text(`${"x".repeat(150)}\n${STUB_MARKER(MIN_TRUNCATION_CHARS + 1 - 300)}\n${"x".repeat(150)}`),
    ]);
  });

  it("omits image blocks and records the count in the stub", () => {
    const messages: AgentMessage[] = [
      assistant([toolCall("a")]),
      toolResult("a", [text("tiny"), image(), image()]),
    ];

    const projected = apply(messages, { a: "drop_result" });
    const projectedResult = projected[1] as ToolResultMessage;

    expect(projectedResult.content).toHaveLength(1);
    expect(projectedResult.content[0]).toEqual(
      text(`tiny\n${STUB_MARKER(0)}\n[2 image(s) omitted]`),
    );
    expect(projectedResult.content.some((block) => block.type === "image")).toBe(false);
  });

  it("removes the ToolCall block and its result message on drop_call", () => {
    const call = toolCall("a");
    const messages: AgentMessage[] = [assistant([call]), toolResult("a", [text(LONG_TEXT)])];

    const projected = apply(messages, { a: "drop_call" });

    // The assistant turn is reduced to orphaned thinking/tool call: it is dropped.
    expect(projected).toEqual([]);
  });

  it("preserves the remaining blocks of a multi-tool assistant turn in order", () => {
    const thinking = { type: "thinking" as const, thinking: "let me look" };
    const prose = text("reading both files");
    const callA = toolCall("a");
    const callB = toolCall("b");
    const messages: AgentMessage[] = [
      assistant([thinking, prose, callA, callB]),
      toolResult("a", [text("A")]),
      toolResult("b", [text("B")]),
    ];

    const projected = apply(messages, { a: "drop_call" });

    expect((projected[0] as AssistantMessage).content).toEqual([thinking, prose, callB]);
    expect(projected[1]).toEqual(messages[2]);
    expect(projected).toHaveLength(2);
  });

  it("keeps a fully dropped multi-tool turn that still has prose, without its calls", () => {
    const thinking = { type: "thinking" as const, thinking: "plan" };
    const prose = text("I will read both files.");
    const messages: AgentMessage[] = [
      assistant([thinking, prose, toolCall("a"), toolCall("b")]),
      toolResult("a", [text("A")]),
      toolResult("b", [text("B")]),
    ];

    const projected = apply(messages, { a: "drop_call", b: "drop_call" });

    expect(projected).toHaveLength(1);
    expect((projected[0] as AssistantMessage).content).toEqual([thinking, prose]);
  });

  it("omits an assistant turn left with only thinking content", () => {
    const messages: AgentMessage[] = [
      assistant([{ type: "thinking", thinking: "hmm" }, toolCall("a")]),
      toolResult("a", [text("A")]),
      user("next", 2),
    ];

    const projected = apply(messages, { a: "drop_call" });

    expect(projected).toEqual([messages[2]]);
  });

  it("omits an assistant turn left with only whitespace prose", () => {
    const messages: AgentMessage[] = [
      assistant([text("   "), toolCall("a")]),
      toolResult("a", [text("A")]),
    ];

    expect(apply(messages, { a: "drop_call" })).toEqual([]);
  });

  it("never prunes a call without a paired result (in flight or aborted)", () => {
    const messages: AgentMessage[] = [assistant([toolCall("a")])];

    const projected = apply(messages, { a: "drop_call" });

    expect(projected).toEqual(messages);
    expect(projected[0]).toBe(messages[0]);
  });

  it("never prunes a result without a paired call", () => {
    const orphan = toolResult("a", [text(LONG_TEXT)]);
    const messages: AgentMessage[] = [user("hi"), orphan];

    const projected = apply(messages, { a: "drop_result" });

    expect(projected).toEqual(messages);
    expect(projected[1]).toBe(orphan);
  });

  it("passes user, bash, custom and compaction messages through untouched", () => {
    const prompt = user("hello");
    const bash = {
      role: "bashExecution",
      command: "pnpm test",
      output: LONG_TEXT,
      exitCode: 0,
      cancelled: false,
      truncated: false,
      timestamp: 2,
    } satisfies AgentMessage;
    const custom = {
      role: "custom",
      customType: "note",
      content: LONG_TEXT,
      display: true,
      timestamp: 3,
    } satisfies AgentMessage;
    const compaction = {
      role: "compactionSummary",
      summary: LONG_TEXT,
      tokensBefore: 99,
      timestamp: 4,
    } satisfies AgentMessage;
    const messages: AgentMessage[] = [
      prompt,
      assistant([toolCall("a")]),
      toolResult("a", [text(LONG_TEXT)]),
      bash,
      custom,
      compaction,
    ];

    const projected = apply(messages, { a: "drop_call" });

    expect(projected).toEqual([prompt, bash, custom, compaction]);
    expect(projected[1]).toBe(bash);
    expect(projected[2]).toBe(custom);
    expect(projected[3]).toBe(compaction);
  });

  it("never mutates the projected input messages", () => {
    const original = toolResult("a", [text(LONG_TEXT)]);
    const messages: AgentMessage[] = [assistant([toolCall("a")]), original];

    apply(messages, { a: "drop_result" });

    expect(original.content).toEqual([text(LONG_TEXT)]);
    expect(messages[1]).toBe(original);
  });

  it("counts only text blocks as result text", () => {
    expect(toolResultText(toolResult("a", [text("one"), image(), text("two")]))).toBe("one\ntwo");
    expect(toolResultText(toolResult("a", []))).toBe("");
  });
});
