import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TOOL_PRUNING_CONFIG,
  type AgentMessage,
  type AssistantMessage,
  type ToolCall,
  type ToolPruningConfig,
  type ToolResultMessage,
} from "../../../src/pruning/config";
import { partitionCoolingWindow } from "../../../src/pruning/cooling-window";
import {
  isJudgeWorthwhile,
  normalizeCommand,
  normalizePath,
  runSupersession,
  type SupersessionCandidate,
  type SupersessionOptions,
} from "../../../src/pruning/supersession";

const CWD = "/repo";

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

const read = (id: string, path = "src/app.ts", extra: Record<string, unknown> = {}): ToolCall =>
  call(id, "read", { path, ...extra });

const write = (id: string, path = "src/app.ts"): ToolCall => call(id, "write", { path });

const edit = (id: string, path = "src/app.ts"): ToolCall => call(id, "edit", { path });

const bash = (id: string, command: string): ToolCall => call(id, "bash", { command });

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

/** A stubbable body: 4 000 chars = 1 000 tokens, well above the 380 floor. */
const BODY = (): ToolResultMessage["content"] => [bigText(4_000)];

const configWith = (overrides: Partial<ToolPruningConfig>): ToolPruningConfig => ({
  ...DEFAULT_TOOL_PRUNING_CONFIG,
  ...overrides,
});

/**
 * Partition that protects nothing, so every tool call in the fixture is a
 * candidate: the Cooling Window rules have their own suite and this one is
 * about Phase 0's verdicts. The protected-Turn cap is collapsed as well,
 * because the unified Cooling Window protects the active Turn by default.
 */
const NO_TAIL = configWith({
  coolingRecentTokens: 0,
  minCoolingToolCalls: 0,
  maxProtectedTurnTokens: 0,
});

/** Closing prose message of every fixture Turn. */
const done = (): AgentMessage => prose("All done.");

const openCandidates = (messages: readonly AgentMessage[]) =>
  partitionCoolingWindow(messages, { config: NO_TAIL }).candidates;

const runCase = (
  messages: readonly AgentMessage[],
  options: Partial<SupersessionOptions> = {},
) => runSupersession(messages, openCandidates(messages), { cwd: CWD, ...options });

const ids = (entries: readonly SupersessionCandidate[]): string[] =>
  entries.map((entry) => entry.candidate.toolCallId);

describe("runSupersession — read supersession", () => {
  it("drops a duplicated full read as drop_call", () => {
    const messages: AgentMessage[] = [
      user("Read the file twice"),
      assistant([read("r1")]),
      toolResult("r1", BODY()),
      assistant([read("r2")]),
      toolResult("r2", BODY()),
      done(),
    ];

    const result = runCase(messages);

    // No mutation in between: the older body is a pure duplicate, so the call
    // block itself goes away and only the later read survives.
    expect(result.decisions).toEqual({ r1: "drop_call" });
    expect(result.droppedCount).toBe(1);
    expect(ids(result.remaining)).toEqual(["r2"]);
  });

  it("keeps drop_call when the duplicated body is too short to stub", () => {
    const messages: AgentMessage[] = [
      user("Read a tiny file twice"),
      assistant([read("r1")]),
      toolResult("r1", [bigText(200)]),
      assistant([read("r2")]),
      toolResult("r2", [bigText(200)]),
      done(),
    ];

    const result = runCase(messages);

    // `drop_result` is denied by the minimum truncation size, but removing the
    // duplicated call still loses nothing: it only saved a stub's overhead.
    expect(result.decisions).toEqual({ r1: "drop_call" });
    expect(ids(result.remaining)).toEqual(["r2"]);
  });

  it("drops a read superseded by a later write as drop_result", () => {
    const messages: AgentMessage[] = [
      user("Read then overwrite"),
      assistant([read("r1")]),
      toolResult("r1", BODY()),
      assistant([write("w1")]),
      toolResult("w1", [bigText(500)], { toolName: "write" }),
      done(),
    ];

    const result = runCase(messages);

    // The file was overwritten after being read: the "read X → wrote X" trace
    // is the working state and stays, the stale body goes.
    expect(result.decisions).toEqual({ r1: "drop_result" });
    expect(ids(result.remaining)).toEqual([]);
  });

  it("drops a read superseded after an edit as drop_result, keeping the trace", () => {
    const messages: AgentMessage[] = [
      user("Read, patch, read again"),
      assistant([read("r1")]),
      toolResult("r1", BODY()),
      assistant([edit("e1")]),
      toolResult("e1", [bigText(500)], { toolName: "edit" }),
      assistant([read("r2")]),
      toolResult("r2", BODY()),
      done(),
    ];

    const result = runCase(messages);

    // A later full read alone means drop_call; with a mutation in between the
    // sequence carries information, so only the obsolete body is dropped.
    expect(result.decisions).toEqual({ r1: "drop_result" });
    expect(ids(result.remaining)).toEqual(["r2"]);
  });

  it("keeps a full read whose only later read failed", () => {
    const messages: AgentMessage[] = [
      user("Read, retry, give up"),
      assistant([read("r1")]),
      toolResult("r1", BODY()),
      assistant([read("r2")]),
      toolResult("r2", BODY(), { isError: true }),
      done(),
    ];

    const result = runCase(messages);

    // Supersession needs a successful refresh: a failed read proves nothing.
    expect(result.decisions).toEqual({});
    expect(ids(result.remaining)).toEqual(["r1", "r2"]);
  });

  it("drops a ranged read covered by a later full read", () => {
    const messages: AgentMessage[] = [
      user("Read a slice, then the whole file"),
      assistant([read("r1", "src/app.ts", { offset: 10, limit: 50 })]),
      toolResult("r1", BODY()),
      assistant([read("r2")]),
      toolResult("r2", BODY()),
      done(),
    ];

    const result = runCase(messages);

    expect(result.decisions).toEqual({ r1: "drop_result" });
    expect(ids(result.remaining)).toEqual(["r2"]);
  });

  it("drops a ranged read covered by a later superset range", () => {
    const messages: AgentMessage[] = [
      user("Read a slice, then a wider slice"),
      assistant([read("r1", "src/app.ts", { offset: 10, limit: 50 })]),
      toolResult("r1", BODY()),
      assistant([read("r2", "src/app.ts", { offset: 0, limit: 100 })]),
      toolResult("r2", BODY()),
      done(),
    ];

    const result = runCase(messages);

    expect(result.decisions).toEqual({ r1: "drop_result" });
    expect(ids(result.remaining)).toEqual(["r2"]);
  });

  it("keeps a ranged read that is only partially covered", () => {
    const messages: AgentMessage[] = [
      user("Read two overlapping slices"),
      assistant([read("r1", "src/app.ts", { offset: 10, limit: 50 })]),
      toolResult("r1", BODY()),
      assistant([read("r2", "src/app.ts", { offset: 40, limit: 50 })]),
      toolResult("r2", BODY()),
      done(),
    ];

    const result = runCase(messages);

    // The lines past the overlap were never re-read: still the only source.
    expect(result.decisions).toEqual({});
    expect(ids(result.remaining)).toEqual(["r1", "r2"]);
  });

  it("never escalates an unstubbable ranged read into drop_call", () => {
    const messages: AgentMessage[] = [
      user("Read a tiny slice, then the whole file"),
      assistant([read("r1", "src/app.ts", { offset: 1, limit: 5 })]),
      toolResult("r1", [bigText(200)]),
      assistant([read("r2")]),
      toolResult("r2", BODY()),
      done(),
    ];

    const result = runCase(messages);

    // The rule preserves the trace; if the body is too short to stub, the pair
    // simply stays instead of losing the call.
    expect(result.decisions).toEqual({});
    expect(ids(result.remaining)).toEqual(["r1", "r2"]);
  });

  it("drops a ranged read when a later write exists", () => {
    const messages: AgentMessage[] = [
      user("Read a slice, then overwrite"),
      assistant([read("r1", "src/app.ts", { offset: 10, limit: 50 })]),
      toolResult("r1", BODY()),
      assistant([write("w1")]),
      toolResult("w1", [bigText(500)], { toolName: "write" }),
      done(),
    ];

    const result = runCase(messages);

    expect(result.decisions).toEqual({ r1: "drop_result" });
    expect(ids(result.remaining)).toEqual([]);
  });

  it("drops a bulky error read once the path was read successfully later", () => {
    const messages: AgentMessage[] = [
      user("The path did not exist; read again after creating it"),
      assistant([read("r1")]),
      toolResult("r1", [bigText(4_000)], { isError: true }),
      assistant([write("w1")]),
      toolResult("w1", [bigText(500)], { toolName: "write" }),
      assistant([read("r2")]),
      toolResult("r2", BODY()),
      done(),
    ];

    const result = runCase(messages);

    // A bulky error log may lose its body (the result keeps `isError: true`)
    // but never its call: remembering the failure is what prevents a retry.
    expect(result.decisions).toEqual({ r1: "drop_result" });
    expect(ids(result.remaining)).toEqual(["r2"]);
  });

  it("keeps a bulky error read that was never superseded", () => {
    const messages: AgentMessage[] = [
      user("Read a missing file"),
      assistant([read("r1")]),
      toolResult("r1", [bigText(4_000)], { isError: true }),
      done(),
    ];

    const result = runCase(messages);

    expect(result.decisions).toEqual({});
    expect(ids(result.remaining)).toEqual(["r1"]);
  });

  it("uses evidence from inside the Cooling Window without mutating it", () => {
    const messages: AgentMessage[] = [
      user("Read, then read again"),
      assistant([read("r1")]),
      toolResult("r1", BODY()),
      assistant([read("r2")]),
      toolResult("r2", BODY()),
      done(),
    ];
    const partition = partitionCoolingWindow(messages, {
      config: configWith({
        coolingRecentTokens: 0,
        minCoolingToolCalls: 1,
        maxProtectedTurnTokens: 0,
      }),
    });

    const result = runSupersession(messages, partition.candidates, { cwd: CWD });

    // `r2` sits in the protected tail and is therefore not a candidate, but it
    // still proves that `r1` is obsolete.
    expect(partition.candidates.map((candidate) => candidate.toolCallId)).toEqual(["r1"]);
    expect(result.decisions).toEqual({ r1: "drop_call" });
    expect(result.remaining).toEqual([]);
  });

  it("normalises paths against the cwd before comparing", () => {
    const messages: AgentMessage[] = [
      user("Read the same file by two spellings"),
      assistant([read("r1", "./src/app.ts")]),
      toolResult("r1", BODY()),
      assistant([read("r2", `${CWD}/src/../src/app.ts`)]),
      toolResult("r2", BODY()),
      done(),
    ];

    const result = runCase(messages);

    expect(result.decisions).toEqual({ r1: "drop_call" });
    expect(ids(result.remaining)).toEqual(["r2"]);
  });

  it("annotates survivors with editedLater", () => {
    const messages: AgentMessage[] = [
      user("Read then patch"),
      assistant([read("r1")]),
      toolResult("r1", BODY()),
      assistant([edit("e1")]),
      toolResult("e1", [bigText(500)], { toolName: "edit" }),
      done(),
    ];

    const result = runCase(messages);

    // A single read is never superseded by an edit, but Phase 1 must know the
    // body it sees is stale in substance.
    expect(result.decisions).toEqual({});
    expect(result.remaining.map((entry) => entry.signals)).toEqual([
      { editedLater: true, sameCommandRanLater: false, laterCommandSucceeded: false },
    ]);
  });

  it("leaves exploratory tools other than read untouched", () => {
    const messages: AgentMessage[] = [
      user("Grep the same pattern twice"),
      assistant([call("g1", "grep", { pattern: "foo" })]),
      toolResult("g1", BODY(), { toolName: "grep" }),
      assistant([call("g2", "grep", { pattern: "foo" })]),
      toolResult("g2", BODY(), { toolName: "grep" }),
      done(),
    ];

    const result = runCase(messages);

    // Phase 0 only proves supersession for file reads; repeated searches are
    // left to the judge.
    expect(result.decisions).toEqual({});
    expect(ids(result.remaining)).toEqual(["g1", "g2"]);
    for (const entry of result.remaining) {
      expect(entry.signals).toEqual({
        editedLater: false,
        sameCommandRanLater: false,
        laterCommandSucceeded: false,
      });
    }
  });

  it("keeps a read whose arguments carry no usable path", () => {
    const messages: AgentMessage[] = [
      user("Read with a malformed path"),
      assistant([read("r1", "")]),
      toolResult("r1", BODY()),
      assistant([read("r2", "")]),
      toolResult("r2", BODY()),
      done(),
    ];

    const result = runCase(messages);

    expect(result.decisions).toEqual({});
    expect(ids(result.remaining)).toEqual(["r1", "r2"]);
  });
});

describe("runSupersession — bash command signals", () => {
  it("flags a command that ran again later and succeeded", () => {
    const messages: AgentMessage[] = [
      user("Run the tests"),
      assistant([bash("b1", "pnpm test")]),
      toolResult("b1", BODY(), { toolName: "bash", isError: true }),
      assistant([bash("b2", "pnpm test")]),
      toolResult("b2", BODY(), { toolName: "bash" }),
      done(),
    ];

    const result = runCase(messages);

    // `bash` never receives `drop_call` and Phase 0 has no supersession rule
    // for commands: the judge gets the signal instead.
    expect(result.decisions).toEqual({});
    expect(ids(result.remaining)).toEqual(["b1", "b2"]);
    expect(result.remaining[0].signals).toEqual({
      editedLater: false,
      sameCommandRanLater: true,
      laterCommandSucceeded: true,
    });
    expect(result.remaining[1].signals).toEqual({
      editedLater: false,
      sameCommandRanLater: false,
      laterCommandSucceeded: false,
    });
  });

  it("flags a re-run that only failed", () => {
    const messages: AgentMessage[] = [
      user("Run the tests twice"),
      assistant([bash("b1", "pnpm test")]),
      toolResult("b1", BODY(), { toolName: "bash" }),
      assistant([bash("b2", "pnpm test")]),
      toolResult("b2", BODY(), { toolName: "bash", isError: true }),
      done(),
    ];

    const result = runCase(messages);

    expect(result.remaining[0].signals).toEqual({
      editedLater: false,
      sameCommandRanLater: true,
      laterCommandSucceeded: false,
    });
  });

  it("matches commands across working-directory prefixes and plumbing", () => {
    const messages: AgentMessage[] = [
      user("Run the tests, then run them again quietly"),
      assistant([bash("b1", "cd packages/coding-agent && pnpm test > /dev/null 2>&1")]),
      toolResult("b1", BODY(), { toolName: "bash", isError: true }),
      assistant([bash("b2", "  pnpm   test  ")]),
      toolResult("b2", BODY(), { toolName: "bash" }),
      done(),
    ];

    const result = runCase(messages);

    expect(result.remaining[0].signals.sameCommandRanLater).toBe(true);
    expect(result.remaining[0].signals.laterCommandSucceeded).toBe(true);
  });

  it("does not match a different command", () => {
    const messages: AgentMessage[] = [
      user("Lint after testing"),
      assistant([bash("b1", "pnpm test")]),
      toolResult("b1", BODY(), { toolName: "bash", isError: true }),
      assistant([bash("b2", "pnpm lint")]),
      toolResult("b2", BODY(), { toolName: "bash" }),
      done(),
    ];

    const result = runCase(messages);

    expect(result.remaining[0].signals).toEqual({
      editedLater: false,
      sameCommandRanLater: false,
      laterCommandSucceeded: false,
    });
  });
});

describe("runSupersession — Phase 1 handover", () => {
  it("reports the tokens Phase 0 reclaimed and the pool it leaves behind", () => {
    const messages: AgentMessage[] = [
      user("Read both files, then re-read one"),
      assistant([read("r1", "src/a.ts"), read("r2", "src/b.ts")]),
      toolResult("r1", BODY()),
      toolResult("r2", BODY()),
      assistant([read("r3", "src/a.ts")]),
      toolResult("r3", BODY()),
      done(),
    ];
    const candidates = openCandidates(messages);
    const byId = new Map(candidates.map((candidate) => [candidate.toolCallId, candidate]));

    const result = runSupersession(messages, candidates, { cwd: CWD });

    expect(result.decisions).toEqual({ r1: "drop_call" });
    expect(result.droppedTokens).toBe(byId.get("r1")?.tokensEst);
    expect(result.remainingTokens).toBe(
      (byId.get("r2")?.tokensEst ?? 0) + (byId.get("r3")?.tokensEst ?? 0),
    );
  });

  it("returns an empty result for an empty pool", () => {
    expect(runSupersession([], [], { cwd: CWD })).toEqual({
      decisions: {},
      remaining: [],
      droppedCount: 0,
      droppedTokens: 0,
      remainingTokens: 0,
    });
  });

  it("never touches the network", () => {
    const messages: AgentMessage[] = [
      user("Read twice"),
      assistant([read("r1")]),
      toolResult("r1", BODY()),
      assistant([read("r2")]),
      toolResult("r2", BODY()),
      done(),
    ];

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const result = runCase(messages);
      expect(result.decisions).toEqual({ r1: "drop_call" });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("isJudgeWorthwhile", () => {
  it("skips the judge when the pool is below minJudgeWorthwhileTokens", () => {
    expect(
      isJudgeWorthwhile({
        activeTokens: 150_000,
        contextWindow: 160_000,
        remainingCandidateTokens: 3_999,
      }),
    ).toBe(false);
  });

  it("skips the judge when the context is comfortably below the 30 % line", () => {
    expect(
      isJudgeWorthwhile({
        activeTokens: 30_000,
        contextWindow: 100_000,
        remainingCandidateTokens: 50_000,
      }),
    ).toBe(false);
  });

  it("calls the judge above the 30 % line with a worthwhile pool", () => {
    expect(
      isJudgeWorthwhile({
        activeTokens: 30_001,
        contextWindow: 100_000,
        remainingCandidateTokens: 4_000,
      }),
    ).toBe(true);
  });

  it("reports the reclaimed tokens so the runner can recompute activeTokens", () => {
    const messages: AgentMessage[] = [
      user("Read twice"),
      assistant([read("r1")]),
      toolResult("r1", BODY()),
      assistant([read("r2")]),
      toolResult("r2", BODY()),
      done(),
    ];
    const result = runCase(messages);

    // `droppedTokens` is the runner's `activeTokens` reduction: the pool left
    // behind is what the judge may still reclaim.
    expect(result.droppedTokens).toBeGreaterThan(0);
    expect(result.remainingTokens).toBeGreaterThanOrEqual(0);
  });
});

describe("normalizePath", () => {
  it("resolves relative spellings against the cwd", () => {
    expect(normalizePath("./src/app.ts", CWD)).toBe("/repo/src/app.ts");
    expect(normalizePath("src/../src/app.ts", CWD)).toBe("/repo/src/app.ts");
    expect(normalizePath("src/app.ts", CWD)).toBe("/repo/src/app.ts");
  });

  it("keeps absolute paths outside the cwd", () => {
    expect(normalizePath("/other/src/app.ts", CWD)).toBe("/other/src/app.ts");
  });

  it("never consults ambient process state without a cwd", () => {
    expect(normalizePath("src/./app.ts", "")).toBe("src/app.ts");
  });
});

describe("normalizeCommand", () => {
  it("collapses whitespace", () => {
    expect(normalizeCommand("  pnpm   test  ")).toBe("pnpm test");
  });

  it("drops a leading cd segment", () => {
    expect(normalizeCommand("cd packages/coding-agent && pnpm test")).toBe("pnpm test");
  });

  it("drops trailing redirections, fallbacks and separators", () => {
    expect(normalizeCommand("pnpm test > /dev/null 2>&1")).toBe("pnpm test");
    expect(normalizeCommand("pnpm test 2>&1")).toBe("pnpm test");
    expect(normalizeCommand("pnpm test || true")).toBe("pnpm test");
    expect(normalizeCommand("pnpm test;")).toBe("pnpm test");
  });

  it("keeps the meaningful part of the command", () => {
    expect(normalizeCommand("pnpm test tests/unit")).toBe("pnpm test tests/unit");
    expect(normalizeCommand("tsc --noEmit")).toBe("tsc --noEmit");
  });
});
