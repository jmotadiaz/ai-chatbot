import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOOL_PRUNING_CONFIG,
  type AgentMessage,
  type AssistantMessage,
  type ToolCall,
  type ToolPruningConfig,
  type ToolResultMessage,
} from "../../../src/pruning/config";
import { partitionCoolingWindow } from "../../../src/pruning/cooling-window";

const usage: AssistantMessage["usage"] = {
  input: 1,
  output: 1,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 2,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const user = (content: string, timestamp = 1): AgentMessage => ({
  role: "user",
  content,
  timestamp,
});

const assistant = (
  content: AssistantMessage["content"],
  timestamp = 1,
): AssistantMessage => ({
  role: "assistant",
  content,
  api: "openai-completions",
  provider: "openai",
  model: "test-model",
  usage,
  stopReason: "toolUse",
  timestamp,
});

const prose = (value: string, timestamp = 1): AssistantMessage =>
  assistant([{ type: "text", text: value }], timestamp);

const call = (id: string, name: string, args: Record<string, unknown>): ToolCall => ({
  type: "toolCall",
  id,
  name,
  arguments: args,
});

const read = (id: string, path = "src/app.ts"): ToolCall => call(id, "read", { path });

const toolResult = (
  toolCallId: string,
  content: ToolResultMessage["content"],
  overrides: Partial<ToolResultMessage> = {},
): ToolResultMessage => ({
  role: "toolResult",
  toolCallId,
  toolName: "read",
  content,
  isError: false,
  timestamp: 1_700_000_000_000,
  ...overrides,
});

/** `chars` of filler text: exactly `chars / 4` estimated tokens. */
const bigText = (chars: number): { type: "text"; text: string } => ({
  type: "text",
  text: "x".repeat(chars),
});

const configWith = (overrides: Partial<ToolPruningConfig>): ToolPruningConfig => ({
  ...DEFAULT_TOOL_PRUNING_CONFIG,
  ...overrides,
});

/** Tail protection so small that only the last tool call is ever protected. */
const TINY_TAIL = configWith({ coolingRecentTokens: 0, minCoolingToolCalls: 1 });

const ids = (partition: ReturnType<typeof partitionCoolingWindow>): string[] =>
  partition.candidates.map((candidate) => candidate.toolCallId);

/**
 * Turn 1 explores two files, Turn 2 talks about the plan without tools and
 * Turn 3 edits the file the plan pointed at.
 */
const exploreConverseEdit = (): AgentMessage[] => [
  user("Explore the repository and propose a plan"), // 0
  assistant([read("r1", "src/plan.ts"), read("r2", "src/other.ts")]), // 1
  toolResult("r1", [bigText(4_000)]), // 2
  toolResult("r2", [bigText(4_000)]), // 3
  prose("Plan: rewrite the parser in src/plan.ts."), // 4
  user("Let's discuss the wording of the plan first", 2), // 5 — turn 2
  prose("Sure: here is the wording.", 2), // 6
  user("Implement it now", 3), // 7 — turn 3
  assistant([call("e1", "edit", { path: "src/plan.ts" })], 3), // 8
  toolResult("e1", [bigText(4_000)], { toolName: "edit", timestamp: 3 }), // 9
];

describe("partitionCoolingWindow", () => {
  it("protects the last completed turn with tools across an intermediate prose-only turn", () => {
    // Turn 3 is active, Turn 2 is prose-only and Turn 1 used tools: the plan's
    // reads must stay protected (rule c), otherwise the prose turn would
    // prematurely unprotect them (the Ratchet Bug).
    const partition = partitionCoolingWindow(exploreConverseEdit(), {
      trigger: "turn_watermark",
      config: TINY_TAIL,
    });

    expect(partition.protectedStartIndex).toBe(0);
    expect(partition.candidates).toEqual([]);
    expect(partition.candidateTokens).toBe(0);
  });

  it("releases those reads once a later completed turn has used tools", () => {
    const messages = exploreConverseEdit();
    messages.push(
      user("Verify the change", 4), // 10 — turn 4
      assistant([call("b1", "bash", { command: "pnpm test" })], 4), // 11
      toolResult("b1", [bigText(4_000)], { toolName: "bash", timestamp: 4 }), // 12
    );

    const partition = partitionCoolingWindow(messages, {
      trigger: "turn_watermark",
      config: TINY_TAIL,
    });

    // Turn 3 (the last completed turn with tools) is protected in full, so the
    // read results of Turn 1 are now the Living Candidate Pool.
    expect(partition.protectedStartIndex).toBe(7);
    expect(ids(partition)).toEqual(["r1", "r2"]);
    expect(partition.candidates.map((candidate) => candidate.resultIndex)).toEqual([2, 3]);
    for (const candidate of partition.candidates) {
      expect(candidate.eligibility).toEqual({
        dropResult: true,
        dropCall: true,
        requiresSupersessionOrJudge: false,
      });
      expect(candidate.resultTokens).toBe(1_000);
    }
    expect(partition.candidateTokens).toBe(
      partition.candidates.reduce((total, candidate) => total + candidate.tokensEst, 0),
    );
  });

  it("caps a single giant completed turn and makes its excess prefix evaluable", () => {
    // 20 results of 8 000 chars = 20 000 tokens of results, plus the assistant
    // call block: the turn exceeds the 40 000-token cap by a hair.
    const calls = Array.from({ length: 20 }, (_, index) =>
      read(`r${index + 1}`, `src/file-${index + 1}.ts`),
    );
    const messages: AgentMessage[] = [
      user("Explore everything"), // 0
      assistant(calls), // 1
      ...calls.map((toolCall) => toolResult(toolCall.id, [bigText(8_000)])), // 2..21
      prose("Exploration complete."), // 22
      user("Continue", 2), // 23 — turn 2
      prose("Continuing.", 2), // 24
    ];

    const partition = partitionCoolingWindow(messages, { trigger: "turn_watermark" });

    // Only the most recent 20 000 tokens of Turn 1 stay protected: the last ten
    // results. The first ten results (indices 2..11) become evaluable.
    expect(partition.protectedStartIndex).toBe(12);
    expect(ids(partition)).toEqual(
      Array.from({ length: 10 }, (_, index) => `r${index + 1}`),
    );
    for (const candidate of partition.candidates) {
      expect(candidate.resultTokens).toBe(2_000);
    }
  });

  it("protects the whole active turn on a turn-start Epoch", () => {
    // A single, still-active turn: rule (a) protects everything from its user
    // message, so the turn-start Epoch never prunes inside the active turn.
    const messages: AgentMessage[] = [
      user("Explore everything"),
      assistant([read("r1"), read("r2")]),
      toolResult("r1", [bigText(8_000)]),
      toolResult("r2", [bigText(8_000)]),
    ];

    const partition = partitionCoolingWindow(messages, { trigger: "turn_watermark" });

    expect(partition.protectedStartIndex).toBe(0);
    expect(partition.candidates).toEqual([]);
  });

  it("protects only the recent tail on an intra-turn emergency Epoch", () => {
    // Same marathon turn, but the emergency valve is allowed to release the
    // obsolete explorations of the first half of the turn.
    const calls = Array.from({ length: 20 }, (_, index) => read(`r${index + 1}`));
    const messages: AgentMessage[] = [
      user("Explore everything"),
      assistant(calls),
      ...calls.map((toolCall) => toolResult(toolCall.id, [bigText(8_000)])),
    ];

    const partition = partitionCoolingWindow(messages, {
      trigger: "intra_turn_emergency",
    });

    // Default tail: 16 000 tokens and 6 calls → the last eight results (r13..r20).
    expect(partition.protectedStartIndex).toBe(14);
    expect(ids(partition)).toEqual(
      Array.from({ length: 12 }, (_, index) => `r${index + 1}`),
    );
  });

  it("never protects fewer than the minimum recent tool calls", () => {
    const messages: AgentMessage[] = [
      user("go"),
      assistant([read("r1"), read("r2"), read("r3")]),
      toolResult("r1", [bigText(100)]),
      toolResult("r2", [bigText(100)]),
      toolResult("r3", [bigText(100)]),
    ];

    const protectedByCalls = partitionCoolingWindow(messages, {
      trigger: "intra_turn_emergency",
      config: TINY_TAIL,
    });
    expect(ids(protectedByCalls)).toEqual(["r1", "r2"]);

    const callFloor = partitionCoolingWindow(messages, {
      trigger: "intra_turn_emergency",
      config: configWith({ coolingRecentTokens: 0, minCoolingToolCalls: 6 }),
    });
    expect(callFloor.candidates).toEqual([]);
    expect(callFloor.protectedStartIndex).toBe(0);
  });

  it("skips calls already masked on the active branch", () => {
    const messages: AgentMessage[] = [
      user("go"),
      assistant([read("r1"), read("r2")]),
      toolResult("r1", [bigText(4_000)]),
      toolResult("r2", [bigText(4_000)]),
      assistant([read("r3")]),
      toolResult("r3", [bigText(4_000)]),
    ];

    const partition = partitionCoolingWindow(messages, {
      trigger: "intra_turn_emergency",
      config: TINY_TAIL,
      masks: { r1: "drop_result", r2: "drop_call" },
    });

    expect(partition.candidates).toEqual([]);
  });

  it("excludes an in-flight call that has no paired result", () => {
    const messages: AgentMessage[] = [
      user("go"),
      assistant([read("r1"), read("r2")]),
      toolResult("r1", [bigText(4_000)]),
    ];

    const partition = partitionCoolingWindow(messages, {
      trigger: "intra_turn_emergency",
      config: TINY_TAIL,
    });

    expect(partition.candidates).toEqual([]);
  });

  it("applies the Error Gate and the tool policy to the candidate pool", () => {
    const messages: AgentMessage[] = [
      user("go"),
      assistant([
        read("r1"),
        read("r2"),
        call("b1", "bash", { command: "pnpm test" }),
        call("e1", "edit", { path: "src/app.ts" }),
        read("r3"),
      ]),
      toolResult("r1", [bigText(8_000)], { isError: true }), // bulky error: drop_result only
      toolResult("r2", [bigText(500)], { isError: true }), // short error: forced keep
      toolResult("b1", [bigText(8_000)], { toolName: "bash", isError: true }),
      toolResult("e1", [bigText(8_000)], { toolName: "edit" }), // mutation: keep
      toolResult("r3", [bigText(8_000)]),
    ];

    const partition = partitionCoolingWindow(messages, {
      trigger: "intra_turn_emergency",
      config: TINY_TAIL,
    });

    // The last result (r3) is the protected tail; the mutation is denied and the
    // short error is gated. Both bulky errors survive as conditional candidates.
    expect(ids(partition)).toEqual(["r1", "b1"]);
    for (const candidate of partition.candidates) {
      expect(candidate.isError).toBe(true);
      expect(candidate.eligibility).toEqual({
        dropResult: true,
        dropCall: false,
        requiresSupersessionOrJudge: true,
      });
    }
  });

  it("returns an empty partition for an empty context", () => {
    const partition = partitionCoolingWindow([], { trigger: "turn_watermark" });

    expect(partition).toEqual({
      trigger: "turn_watermark",
      protectedStartIndex: 0,
      protectedTokens: 0,
      candidates: [],
      candidateTokens: 0,
    });
  });
});
