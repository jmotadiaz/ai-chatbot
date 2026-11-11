import { describe, expect, it } from "vitest";
import type { AgentMessage } from "../../../src/pruning/config";
import { partitionCoolingWindow } from "../../../src/pruning/cooling-window";
import {
  assistant,
  bigText,
  call,
  configWith,
  prose,
  read,
  toolResult,
  user,
} from "./fixtures";

/**
 * Tail protection so small that only the last tool call is ever protected. The
 * protected-Turn cap is left at its default so rule (c) still protects the last
 * completed Turn with tools.
 */
const TINY_TAIL = configWith({ coolingRecentTokens: 0, minCoolingToolCalls: 1 });

/** Only the last paired call is protected: no tail budget and no protected Turn. */
const ONLY_LAST_CALL = configWith({
  coolingRecentTokens: 0,
  minCoolingToolCalls: 1,
  maxProtectedTurnTokens: 0,
});

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
  prose("Sure: here is the wording.", { timestamp: 2 }), // 6
  user("Implement it now", 3), // 7 — turn 3
  assistant([call("e1", "edit", { path: "src/plan.ts" })], { timestamp: 3 }), // 8
  toolResult("e1", [bigText(4_000)], { toolName: "edit", timestamp: 3 }), // 9
];

describe("partitionCoolingWindow", () => {
  it("protects the last completed Turn with tools across an intermediate prose-only Turn", () => {
    // Turn 3 is active, Turn 2 is prose-only and Turn 1 used tools: the plan's
    // reads must stay protected (rule c), otherwise the prose Turn would
    // prematurely unprotect them (the Ratchet Bug).
    const partition = partitionCoolingWindow(exploreConverseEdit(), { config: TINY_TAIL });

    expect(partition.protectedStartIndex).toBe(0);
    expect(partition.candidates).toEqual([]);
    expect(partition.candidateTokens).toBe(0);
  });

  it("releases those reads once a later completed Turn has used tools", () => {
    const messages = exploreConverseEdit();
    messages.push(
      user("Verify the change", 4), // 10 — turn 4
      assistant([call("b1", "bash", { command: "pnpm test" })], { timestamp: 4 }), // 11
      toolResult("b1", [bigText(4_000)], { toolName: "bash", timestamp: 4 }), // 12
    );

    const partition = partitionCoolingWindow(messages, { config: TINY_TAIL });

    // Turn 3 (the last completed Turn with tools) is protected in full, so the
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

  it("caps a single giant completed Turn and makes its excess prefix evaluable", () => {
    // 20 results of 8 000 chars = 20 000 tokens of results, plus the assistant
    // call block: the Turn exceeds the 40 000-token cap by a hair.
    const calls = Array.from({ length: 20 }, (_, index) =>
      read(`r${index + 1}`, `src/file-${index + 1}.ts`),
    );
    const messages: AgentMessage[] = [
      user("Explore everything"), // 0
      assistant(calls), // 1
      ...calls.map((toolCall) => toolResult(toolCall.id, [bigText(8_000)])), // 2..21
      prose("Exploration complete."), // 22
      user("Continue", 2), // 23 — turn 2
      prose("Continuing.", { timestamp: 2 }), // 24
    ];

    const partition = partitionCoolingWindow(messages);

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

  it("protects an active Turn inside the cap in full", () => {
    // A single, still-active Turn: it is protected as a whole, so nothing is
    // pruned from the Turn the agent is working in.
    const messages: AgentMessage[] = [
      user("Explore everything"),
      assistant([read("r1"), read("r2")]),
      toolResult("r1", [bigText(8_000)]),
      toolResult("r2", [bigText(8_000)]),
    ];

    const partition = partitionCoolingWindow(messages);

    expect(partition.protectedStartIndex).toBe(0);
    expect(partition.candidates).toEqual([]);
  });

  it("caps a marathon active Turn so its first half becomes evaluable", () => {
    // 20 results of 2 000 tokens plus the call block exceed the 40 000-token
    // cap, so the active Turn keeps only its most recent 20 000 tokens: the
    // first half can be pruned mid-Turn, as a long Subagent needs.
    const calls = Array.from({ length: 20 }, (_, index) => read(`r${index + 1}`));
    const messages: AgentMessage[] = [
      user("Explore everything"),
      assistant(calls),
      ...calls.map((toolCall) => toolResult(toolCall.id, [bigText(8_000)])),
    ];

    const partition = partitionCoolingWindow(messages);

    // The recent tail (16 000 tokens and 6 calls) and the capped Turn agreed on
    // the last ten results (r11..r20).
    expect(partition.protectedStartIndex).toBe(12);
    expect(ids(partition)).toEqual(
      Array.from({ length: 10 }, (_, index) => `r${index + 1}`),
    );
  });

  it("releases the excess prefix of a marathon active Turn that follows a tool Turn", () => {
    // Turn 1 ran one small command, so it is the last completed Turn with tools
    // and is protected in full. Turn 2 is active and enormous (20 results of
    // 2 000 tokens): its own 40 000-token cap must still release the first half.
    // A protected region collapsed into "everything after the earliest start"
    // would let Turn 1 protect Turn 2's whole prefix and make the cap dead code.
    const calls = Array.from({ length: 20 }, (_, index) => read(`r${index + 1}`));
    const messages: AgentMessage[] = [
      user("Run the suite"), // 0 — turn 1
      assistant([call("b1", "bash", { command: "pnpm test" })]), // 1
      toolResult("b1", [bigText(400)], { toolName: "bash" }), // 2
      user("Now explore everything", 2), // 3 — turn 2 (active)
      assistant(calls, { timestamp: 2 }), // 4
      ...calls.map((toolCall) => toolResult(toolCall.id, [bigText(8_000)], { timestamp: 2 })), // 5..24
    ];

    const partition = partitionCoolingWindow(messages);

    // Turn 2's capped span covers the last ten results (indices 15..24) and the
    // recent-tail floor agrees with it, while Turn 1 keeps its own span (0..3).
    // Everything between them — the first ten results of the active Turn — is
    // the evaluable excess prefix.
    expect(partition.protectedSpans).toEqual([
      { start: 0, end: 3 },
      { start: 15, end: 25 },
    ]);
    expect(ids(partition)).toEqual(
      Array.from({ length: 10 }, (_, index) => `r${index + 1}`),
    );
  });

  it("never protects fewer than the minimum recent tool calls", () => {
    // Turn 1 read five files, Turn 2 read one more and Turn 3 is prose only.
    const reads = ["r1", "r2", "r3", "r4", "r5"];
    const messages: AgentMessage[] = [
      user("go"), // 0 — turn 1
      assistant(reads.map((id) => read(id))), // 1
      ...reads.map((id) => toolResult(id, [bigText(100)])), // 2..6
      user("next", 2), // 7 — turn 2
      assistant([read("r6")], { timestamp: 2 }), // 8
      toolResult("r6", [bigText(100)], { timestamp: 2 }), // 9
      user("go on", 3), // 10 — turn 3
      prose("ok", { timestamp: 3 }), // 11
    ];

    // One protected call is the last result of Turn 2: Turn 1 is evaluable.
    const oneCall = partitionCoolingWindow(messages, { config: ONLY_LAST_CALL });
    expect(oneCall.protectedStartIndex).toBe(9);
    expect(ids(oneCall)).toEqual(reads);

    // The floor of six paired calls reaches back into Turn 1 and protects it.
    const callFloor = partitionCoolingWindow(messages, {
      config: configWith({
        coolingRecentTokens: 0,
        minCoolingToolCalls: 6,
        maxProtectedTurnTokens: 0,
      }),
    });
    expect(callFloor.protectedStartIndex).toBe(2);
    expect(callFloor.candidates).toEqual([]);
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
      config: ONLY_LAST_CALL,
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

    const partition = partitionCoolingWindow(messages, { config: ONLY_LAST_CALL });

    expect(partition.candidates).toEqual([]);
  });

  it("applies the Error Gate and the tool policy to the candidate pool", () => {
    const messages: AgentMessage[] = [
      user("go"), // 0 — turn 1
      assistant([
        read("r1"),
        read("r2"),
        call("b1", "bash", { command: "pnpm test" }),
        call("e1", "edit", { path: "src/app.ts" }),
        read("r3"),
      ]), // 1
      toolResult("r1", [bigText(8_000)], { isError: true }), // 2 bulky error: drop_result only
      toolResult("r2", [bigText(500)], { isError: true }), // 3 short error: forced keep
      toolResult("b1", [bigText(8_000)], { toolName: "bash", isError: true }), // 4
      toolResult("e1", [bigText(8_000)], { toolName: "edit" }), // 5 mutation: keep
      toolResult("r3", [bigText(8_000)]), // 6
      user("next", 2), // 7 — turn 2
      assistant([read("r4")], { timestamp: 2 }), // 8
      toolResult("r4", [bigText(4_000)], { timestamp: 2 }), // 9
      user("go on", 3), // 10 — turn 3
      prose("ok", { timestamp: 3 }), // 11
    ];

    const partition = partitionCoolingWindow(messages, { config: ONLY_LAST_CALL });

    // The last result (r4) is the protected tail; the mutation and the short
    // error are denied. Both bulky errors survive as conditional candidates,
    // and so does the successful read of the same Turn.
    expect(ids(partition)).toEqual(["r1", "b1", "r3"]);
    for (const candidate of partition.candidates.filter((entry) => entry.isError)) {
      expect(candidate.eligibility).toEqual({
        dropResult: true,
        dropCall: false,
        requiresSupersessionOrJudge: true,
      });
    }
    expect(partition.candidates.find((entry) => entry.toolCallId === "r3")?.eligibility).toEqual({
      dropResult: true,
      dropCall: true,
      requiresSupersessionOrJudge: false,
    });
  });

  it("returns an empty partition for an empty context", () => {
    const partition = partitionCoolingWindow([]);

    expect(partition).toEqual({
      protectedStartIndex: 0,
      protectedSpans: [],
      protectedTokens: 0,
      candidates: [],
      candidateTokens: 0,
    });
  });
});
