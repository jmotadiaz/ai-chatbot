import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TOOL_PRUNING_CONFIG,
  TOOL_PRUNING_ENTRY_TYPE,
  type AgentMessage,
  type AssistantMessage,
  type ToolCall,
  type ToolPruningConfigOverrides,
  type ToolPruningEpochEntry,
  type ToolResultMessage,
} from "../../../src/pruning/config";
import {
  ToolPruningEpochRunner,
  estimateActiveTokens,
  masksFromBranch,
  type ToolPruningCredentials,
  type ToolPruningEpochRunnerOptions,
  type ToolPruningSessionEntry,
} from "../../../src/pruning/epoch-runner";
import type {
  SystemOneDecisionRequest,
  SystemOneSuccess,
} from "../../../src/pruning/systemone-client";
import type { ToolPruningTraceLogger } from "../../../src/pruning/pruning-bridge";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WINDOW = 100_000;
/** 40 000 chars is 10 000 estimated tokens: a candidate never below the pool floor. */
const BIG_RESULT = "y".repeat(40_000);
const CWD = "/repo";

/**
 * Test config: the spec defaults except for the Cooling Window, which is
 * collapsed so a short fixture still exposes an old turn, and the delta
 * watermark, which is defused so a test can exercise the ratio rule alone.
 */
const BASE_CONFIG: ToolPruningConfigOverrides = {
  coolingRecentTokens: 0,
  minCoolingToolCalls: 0,
  maxProtectedTurnTokens: 0,
  minPrunableDeltaTokens: 1_000_000,
};

const usage = (totalTokens: number): AssistantMessage["usage"] => ({
  input: totalTokens,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});

const user = (content: string, timestamp = 1): AgentMessage => ({
  role: "user",
  content,
  timestamp,
});

const assistant = (
  content: AssistantMessage["content"],
  overrides: Partial<AssistantMessage> = {},
): AssistantMessage => ({
  role: "assistant",
  content,
  api: "openai-completions",
  provider: "openai",
  model: "test-model",
  usage: usage(0),
  stopReason: content.some((block) => block.type === "toolCall") ? "toolUse" : "stop",
  timestamp: 1,
  ...overrides,
});

const prose = (text: string, overrides: Partial<AssistantMessage> = {}): AssistantMessage =>
  assistant([{ type: "text", text }], overrides);

const call = (id: string, name: string, args: Record<string, unknown>): ToolCall => ({
  type: "toolCall",
  id,
  name,
  arguments: args,
});

const bash = (id: string, command: string): ToolCall => call(id, "bash", { command });
const bashResult = (id: string, text = BIG_RESULT): ToolResultMessage => ({
  role: "toolResult",
  toolCallId: id,
  toolName: "bash",
  content: [{ type: "text", text }],
  isError: false,
  timestamp: 1,
});
const grep = (id: string, pattern: string): ToolCall => call(id, "grep", { pattern });
const grepResult = (id: string, text = BIG_RESULT): ToolResultMessage => ({
  role: "toolResult",
  toolCallId: id,
  toolName: "grep",
  content: [{ type: "text", text }],
  isError: false,
  timestamp: 1,
});
const read = (id: string, path = "src/app.ts"): ToolCall => call(id, "read", { path });
const readResult = (id: string, text = BIG_RESULT): ToolResultMessage => ({
  role: "toolResult",
  toolCallId: id,
  toolName: "read",
  content: [{ type: "text", text }],
  isError: false,
  timestamp: 1,
});
const editResult = (id: string): ToolResultMessage => ({
  role: "toolResult",
  toolCallId: id,
  toolName: "edit",
  content: [{ type: "text", text: "ok" }],
  isError: false,
  timestamp: 1,
});

/** One completed tool turn: `count` bash pairs, all worth 10 000 tokens. */
const bashTurn = (prefix: string, count: number): AgentMessage[] =>
  Array.from({ length: count }, (_, index) => {
    const id = `${prefix}-${index + 1}`;
    return [assistant([bash(id, `pnpm task-${id}`)]), bashResult(id)];
  }).flat();

/**
 * A session shaped like the spec: an old exploration turn, an intermediate
 * tool turn and the active turn whose assistant reported `activeTokens`.
 */
const session = (activeTokens: number, middleTurns = 0): AgentMessage[] => [
  user("Implement the parser"),
  ...bashTurn("t1", 6),
  ...Array.from({ length: middleTurns }, (_, index) =>
    bashTurn(`m${index + 1}`, 3),
  ).flat(),
  user("Now wire it up"),
  prose("Working on it", { usage: usage(activeTokens) }),
];

const okJudge = (
  answers: Readonly<Record<string, number>>,
): SystemOneSuccess & { ok: true } => ({
  ok: true,
  answers,
  model: "decision-default",
  latencyMs: 1,
});

/** Judge stub factory: answer every question with `probability`. */
function judgeAnswering(
  probability: number,
): (request: SystemOneDecisionRequest) => Promise<SystemOneSuccess> {
  return async (request) => {
    const answers: Record<string, number> = {};
    for (const name of Object.keys(request.questions)) answers[name] = probability;
    return okJudge(answers);
  };
}

interface Harness {
  runner: ToolPruningEpochRunner;
  judge: ReturnType<typeof vi.fn>;
  entries: ToolPruningEpochEntry[];
  branch: ToolPruningSessionEntry[];
  events: { level: string; name: string; payload?: unknown }[];
  appends: { customType: string; entry: ToolPruningEpochEntry }[];
  /** Answers every question with the probability the current test set. */
  answerWith(probability: number): void;
  /** Makes every decision request fail with an HTTP error. */
  failJudge(): void;
  /** Moves the session leaf, as a Message Edit or a new entry does. */
  moveLeaf(leafId: string): void;
}

/**
 * Runner with every port stubbed: a callable judge, an entry sink that mirrors
 * a session branch (`appendEntry` becomes a `custom` entry on the branch and
 * moves the leaf, exactly like Pi), and a trace sink that records events.
 */
function harness(overrides: Partial<ToolPruningConfigOverrides> = {}): Harness {
  const entries: ToolPruningEpochEntry[] = [];
  const branch: ToolPruningSessionEntry[] = [];
  const events: Harness["events"] = [];
  const appends: Harness["appends"] = [];
  let leafCounter = 0;
  let leafId: string | null = "leaf-0";
  let probability = 0.1;
  let failing = false;

  const trace: ToolPruningTraceLogger = {
    debug: (name, payload) => events.push({ level: "debug", name, payload }),
    info: (name, payload) => events.push({ level: "info", name, payload }),
    warn: (name, payload) => events.push({ level: "warn", name, payload }),
    error: (name, payload) => events.push({ level: "error", name, payload }),
  };

  const judge = vi.fn(async (request: SystemOneDecisionRequest) => {
    if (failing) {
      return {
        ok: false as const,
        reason: "http_error" as const,
        status: 500,
        latencyMs: 1,
      };
    }
    if (probability === 1) return okJudge(answersOf(request, 1));
    return judgeAnswering(probability)(request);
  });

  const credentials: ToolPruningCredentials = {
    baseUrl: "http://127.0.0.1:4000/v1",
    apiKey: "test-key",
  };

  const options: ToolPruningEpochRunnerOptions = {
    cwd: CWD,
    config: { ...BASE_CONFIG, ...overrides },
    getContextWindow: () => WINDOW,
    getCredentials: async () => credentials,
    appendEntry: (customType, entry) => {
      appends.push({ customType, entry });
      entries.push(entry);
      leafCounter += 1;
      leafId = `leaf-${leafCounter}`;
      branch.push({ type: "custom", customType, data: entry });
    },
    getBranch: () => branch,
    getLeafId: () => leafId,
    getTraceLogger: () => trace,
    getSignal: () => undefined,
    judge,
    now: (() => {
      let clock = 1_000;
      return () => (clock += 5);
    })(),
  };

  return {
    runner: new ToolPruningEpochRunner(options),
    judge,
    entries,
    branch,
    events,
    appends,
    answerWith(value) {
      probability = value;
    },
    failJudge() {
      failing = true;
    },
    moveLeaf(next: string) {
      leafId = next;
    },
  };
}

function answersOf(
  request: SystemOneDecisionRequest,
  probability: number,
): Record<string, number> {
  const answers: Record<string, number> = {};
  for (const name of Object.keys(request.questions)) answers[name] = probability;
  return answers;
}

/** Question names of one decision request, for asserting batching policy. */
const questionNames = (request: SystemOneDecisionRequest): string[] =>
  Object.keys(request.questions).sort();

// ---------------------------------------------------------------------------
// Token accounting
// ---------------------------------------------------------------------------

describe("estimateActiveTokens", () => {
  it("uses the provider usage and estimates only what came after it", () => {
    const messages: AgentMessage[] = [
      user("old"),
      prose("answer", { usage: usage(10_000) }),
      assistant([bash("b1", "pnpm test")]),
      bashResult("b1", "z".repeat(400)),
    ];

    // 400 chars of result (100 tokens) + the `bash` call block (7 tokens).
    expect(estimateActiveTokens(messages)).toBe(10_000 + 100 + 7);
  });

  it("falls back to a full estimate when no usage is valid yet", () => {
    const messages: AgentMessage[] = [user("abcd"), bashResult("b1", "z".repeat(400))];

    expect(estimateActiveTokens(messages)).toBe(1 + 100);
  });
});

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

describe("Tool Pruning triggers", () => {
  it("does nothing when the pool is below minWorthwhilePruneTokens", async () => {
    const test = harness();
    const messages: AgentMessage[] = [
      user("go"),
      ...bashTurn("t1", 6).map((message) =>
        message.role === "toolResult"
          ? { ...message, content: [{ type: "text" as const, text: "y".repeat(1_000) }] }
          : message,
      ),
      user("next"),
      prose("ok", { usage: usage(90_000) }),
    ];

    test.runner.beginTurn();
    const projection = await test.runner.onContext(messages);

    expect(test.judge).not.toHaveBeenCalled();
    expect(test.appends).toHaveLength(0);
    expect(projection.changed).toBe(false);
  });

  it("runs a turn-start Epoch only on the first context call of the Turn", async () => {
    const test = harness();
    // Drop only the oldest call, leaving the pool worth a second Epoch.
    test.judge.mockImplementation(async (request: SystemOneDecisionRequest) => {
      const answers = answersOf(request, 1);
      const first = questionNames(request)[0];
      if (first !== undefined) answers[first] = 0.1;
      return okJudge(answers);
    });
    const messages = session(50_000);

    test.runner.beginTurn();
    await test.runner.onContext(messages);
    expect(test.judge).toHaveBeenCalledTimes(1);
    expect(test.appends).toHaveLength(1);

    // Same Turn, second `context` call: only the emergency valve may fire.
    await test.runner.onContext(messages);
    expect(test.judge).toHaveBeenCalledTimes(1);

    // A new Turn arms the turn-start watermark again.
    test.runner.beginTurn();
    await test.runner.onContext(messages);
    expect(test.judge).toHaveBeenCalledTimes(2);
  });

  it("triggers the emergency valve on a later context call above 75%", async () => {
    const test = harness();
    const messages = session(80_000);

    // No `beginTurn`: every call is an intra-Turn call.
    await test.runner.onContext(messages);

    expect(test.judge).toHaveBeenCalledTimes(1);
    expect(test.appends).toHaveLength(1);
    expect(test.entries[0].trigger).toBe("intra_turn_emergency");
  });

  it("never triggers without a resolved model", async () => {
    const test = harness();
    const runner = new ToolPruningEpochRunner({
      cwd: CWD,
      config: { ...BASE_CONFIG },
      getContextWindow: () => undefined,
      judge: test.judge,
      appendEntry: () => {
        throw new Error("must not persist without a model");
      },
    });

    runner.beginTurn();
    const projection = await runner.onContext(session(90_000));

    expect(test.judge).not.toHaveBeenCalled();
    expect(projection.changed).toBe(false);
  });

  it("triggers on prunable delta even when the window is roomy", async () => {
    const test = harness({ minPrunableDeltaTokens: 30_000 });
    // 40 000 active tokens: below the soft watermark (45 000), above the
    // judge short-circuit line (30 000). The 60k pool is what triggers.
    test.runner.beginTurn();
    await test.runner.onContext(session(40_000));

    expect(test.judge).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Phase 0 short-circuit
// ---------------------------------------------------------------------------

describe("Phase 0 short-circuit", () => {
  it("skips the judge when the context stays below 30% of the window", async () => {
    const test = harness({ minPrunableDeltaTokens: 30_000 });
    test.runner.beginTurn();
    const projection = await test.runner.onContext(session(20_000));

    expect(test.judge).not.toHaveBeenCalled();
    expect(test.appends).toHaveLength(0);
    expect(projection.changed).toBe(false);
  });

  it("applies Phase 0 drops without any network call", async () => {
    const test = harness({ minPrunableDeltaTokens: 30_000 });
    const messages: AgentMessage[] = [
      user("read it"),
      assistant([read("r1", "src/app.ts")]),
      readResult("r1"),
      assistant([read("r2", "src/app.ts")]),
      readResult("r2"),
      assistant([bash("b1", "pnpm test")]),
      bashResult("b1"),
      user("next"),
      prose("done", { usage: usage(20_000) }),
    ];

    test.runner.beginTurn();
    const projection = await test.runner.onContext(messages);

    expect(test.judge).not.toHaveBeenCalled();
    expect(test.appends).toHaveLength(1);
    expect(test.entries[0].decisions).toEqual({ r1: "drop_call" });
    // The duplicate read disappeared: its call block emptied the assistant
    // message (which is then omitted) and its result went with it.
    expect(projection.messages).toHaveLength(messages.length - 2);
  });
});

// ---------------------------------------------------------------------------
// Persistence (D7)
// ---------------------------------------------------------------------------

describe("Epoch persistence", () => {
  it("persists the D7 entry schema and projects the drops", async () => {
    const test = harness();
    test.answerWith(0.1);
    const messages = session(50_000);

    test.runner.beginTurn();
    const projection = await test.runner.onContext(messages);

    expect(test.appends).toHaveLength(1);
    expect(test.appends[0].customType).toBe(TOOL_PRUNING_ENTRY_TYPE);
    const entry = test.appends[0].entry;
    expect(entry).toMatchObject({
      version: 1,
      epochId: 1,
      trigger: "turn_watermark",
      tokensBefore: 50_000,
    });
    expect(typeof entry.timestamp).toBe("number");
    expect(entry.tokensSavedEst).toBe(60_000);
    expect(Object.keys(entry.decisions)).toHaveLength(6);
    expect(Object.values(entry.decisions)).toEqual(Array(6).fill("drop_result"));
    expect(entry.stats).toMatchObject({
      deterministicDrops: 0,
      judgeDrops: 6,
      candidatesEvaluated: 6,
      batches: 1,
      decisionModel: "decision-default",
    });
    expect(entry.stats.latencyMs).toBeGreaterThanOrEqual(0);
    expect(entry.stats.failedOpen).toBeUndefined();

    // `bash` never loses its call block: the stub replaces the result body.
    expect(projection.messages).toHaveLength(messages.length);
    const stubbed = projection.messages.find(
      (message) => message.role === "toolResult" && message.toolCallId === "t1-1",
    );
    expect(stubbed?.role).toBe("toolResult");
    expect(JSON.stringify(stubbed)).toContain("Tool Pruning: omitted");
  });

  it("persists `drop_call` for exploratory tools and removes both messages", async () => {
    const test = harness();
    test.answerWith(0.1);
    const messages: AgentMessage[] = [
      user("search"),
      ...Array.from({ length: 2 }, (_, index) => {
        const id = `g${index + 1}`;
        return [assistant([grep(id, `pattern-${id}`)]), grepResult(id)];
      }).flat(),
      user("next"),
      prose("ok", { usage: usage(50_000) }),
    ];

    test.runner.beginTurn();
    const projection = await test.runner.onContext(messages);

    expect(test.entries[0].decisions).toEqual({ g1: "drop_call", g2: "drop_call" });
    expect(projection.messages).toHaveLength(messages.length - 4);
    // Exploratory calls ask both questions; `bash` only asks about the result.
    expect(questionNames(test.judge.mock.calls[0][0])).toEqual([
      "call_c1",
      "call_c2",
      "result_c1",
      "result_c2",
    ]);
  });

  it("keeps the session untouched when the feature is disabled", async () => {
    const test = harness({ enabled: false });
    test.runner.beginTurn();

    const projection = await test.runner.onContext(session(90_000));

    expect(test.judge).not.toHaveBeenCalled();
    expect(projection.changed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cooldown (D3)
// ---------------------------------------------------------------------------

describe("Epoch cooldown", () => {
  it("blocks new Epochs after a low-yield Epoch until the pool grows 15k", async () => {
    const test = harness();
    test.answerWith(1); // keep everything: zero tokens reclaimed

    test.runner.beginTurn();
    await test.runner.onContext(session(50_000));
    expect(test.judge).toHaveBeenCalledTimes(1);
    expect(test.appends).toHaveLength(0);

    // Same pool (60k): no growth, so the next Turn is throttled.
    test.runner.beginTurn();
    await test.runner.onContext(session(50_000));
    expect(test.judge).toHaveBeenCalledTimes(1);

    // One extra completed tool turn brings 30k more prunable tokens in.
    test.runner.beginTurn();
    await test.runner.onContext(session(50_000, 1));
    expect(test.judge).toHaveBeenCalledTimes(2);
  });

  it("lifts the cooldown on the first emergency crossing of 75%", async () => {
    const test = harness();
    test.answerWith(1);

    test.runner.beginTurn();
    await test.runner.onContext(session(50_000));
    expect(test.judge).toHaveBeenCalledTimes(1);

    test.runner.beginTurn();
    await test.runner.onContext(session(50_000));
    expect(test.judge).toHaveBeenCalledTimes(1);

    // Intra-Turn emergency: the safety valve overrides the cooldown once.
    await test.runner.onContext(session(80_000));
    expect(test.judge).toHaveBeenCalledTimes(2);
    expect(test.events.map((event) => event.name)).toContain(
      "tool_pruning.cooldown_bypassed",
    );

    // The override is spent for this Turn; the cooldown is back.
    await test.runner.onContext(session(80_000));
    expect(test.judge).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Fail-open (D6)
// ---------------------------------------------------------------------------

describe("Fail-open", () => {
  it("mutates nothing when Phase 0 savings alone are below 4k", async () => {
    const test = harness();
    test.failJudge();
    const messages: AgentMessage[] = [
      user("read it"),
      assistant([read("r1", "src/app.ts")]),
      readResult("r1", "z".repeat(1_000)),
      assistant([call("e1", "edit", { path: "src/app.ts" })]),
      editResult("e1"),
      assistant([read("r2", "src/app.ts")]),
      readResult("r2", "z".repeat(1_000)),
      ...bashTurn("t1", 6),
      user("next"),
      prose("done", { usage: usage(50_000) }),
    ];

    test.runner.beginTurn();
    const projection = await test.runner.onContext(messages);

    expect(test.judge).toHaveBeenCalledTimes(1);
    expect(test.appends).toHaveLength(0);
    expect(projection.changed).toBe(false);
    expect(test.events.map((event) => event.name)).toContain(
      "tool_pruning.epoch_failed_open",
    );

    // The cooldown keeps a degraded judge from retrying on the next Turn.
    test.runner.beginTurn();
    await test.runner.onContext(messages);
    expect(test.judge).toHaveBeenCalledTimes(1);
  });

  it("persists Phase 0 drops when they alone are worth the prefix update", async () => {
    const test = harness();
    test.failJudge();
    const messages: AgentMessage[] = [
      user("read it"),
      assistant([read("r1", "src/app.ts")]),
      readResult("r1"),
      assistant([read("r2", "src/app.ts")]),
      readResult("r2"),
      assistant([bash("b1", "pnpm test")]),
      bashResult("b1"),
      user("next"),
      prose("done", { usage: usage(50_000) }),
    ];

    test.runner.beginTurn();
    await test.runner.onContext(messages);

    expect(test.appends).toHaveLength(1);
    const entry = test.appends[0].entry;
    expect(entry.decisions).toEqual({ r1: "drop_call" });
    expect(entry.stats.failedOpen).toBe(true);
    expect(entry.stats.deterministicDrops).toBe(1);
    expect(entry.stats.judgeDrops).toBe(0);
  });

  it("neither persists nor mutates when the Turn was aborted", async () => {
    const controller = new AbortController();
    const judge = vi.fn(async (request: SystemOneDecisionRequest) => {
      controller.abort();
      return okJudge(answersOf(request, 0.1));
    });
    const runner = new ToolPruningEpochRunner({
      cwd: CWD,
      config: { ...BASE_CONFIG },
      getContextWindow: () => WINDOW,
      getCredentials: async () => ({ baseUrl: "http://127.0.0.1:4000/v1" }),
      appendEntry: () => {
        throw new Error("an aborted Epoch must not write to the session");
      },
      getSignal: () => controller.signal,
      judge,
    });

    runner.beginTurn();
    const projection = await runner.onContext(session(50_000));

    expect(judge).toHaveBeenCalledTimes(1);
    expect(runner.activeMasks).toEqual({});
    expect(projection.changed).toBe(false);
  });

  it("treats missing credentials as a fail-open Epoch", async () => {
    const test = harness();
    const runner = new ToolPruningEpochRunner({
      cwd: CWD,
      config: { ...BASE_CONFIG },
      getContextWindow: () => WINDOW,
      getCredentials: async () => undefined,
      appendEntry: () => {
        throw new Error("no drops were decided");
      },
      judge: test.judge,
    });

    runner.beginTurn();
    await runner.onContext(session(50_000));

    expect(test.judge).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Two-band policy (D5 Phase 1.3)
// ---------------------------------------------------------------------------

describe("Emergency band extension", () => {
  const uncertainBand = async (activeTokens: number) => {
    const test = harness();
    test.judge.mockImplementation(async (request: SystemOneDecisionRequest) =>
      okJudge(answersOf(request, 0.3)),
    );
    if (activeTokens >= 75_000) {
      // Intra-Turn call: no `beginTurn`, so the emergency valve is in charge.
      await test.runner.onContext(session(activeTokens));
    } else {
      test.runner.beginTurn();
      await test.runner.onContext(session(activeTokens));
    }
    return test;
  };

  it("keeps the uncertain [0.25, 0.40) band in a normal Epoch", async () => {
    const test = await uncertainBand(50_000);

    expect(test.judge).toHaveBeenCalledTimes(1);
    expect(test.appends).toHaveLength(0);
  });

  it("extends `drop_result` into that band in a high-pressure emergency Epoch", async () => {
    const test = await uncertainBand(80_000);

    expect(test.appends).toHaveLength(1);
    // 80 000 → three 10 000-token results reach the 55 000 target.
    expect(Object.values(test.appends[0].entry.decisions)).toEqual(
      Array(3).fill("drop_result"),
    );
    expect(test.appends[0].entry.trigger).toBe("intra_turn_emergency");
  });
});

// ---------------------------------------------------------------------------
// Branch-aware reconstruction (D7)
// ---------------------------------------------------------------------------

describe("branch-aware masks", () => {
  const epochEntry = (
    epochId: number,
    decisions: Record<string, "drop_result" | "drop_call">,
  ): ToolPruningEpochEntry => ({
    version: 1,
    epochId,
    trigger: "turn_watermark",
    timestamp: 1,
    tokensBefore: 1,
    tokensSavedEst: 1,
    decisions,
    stats: {
      deterministicDrops: 0,
      judgeDrops: Object.keys(decisions).length,
      candidatesEvaluated: Object.keys(decisions).length,
      batches: 1,
      latencyMs: 1,
    },
  });

  const customEntry = (data: unknown): ToolPruningSessionEntry => ({
    type: "custom",
    customType: TOOL_PRUNING_ENTRY_TYPE,
    data,
  });

  it("merges every tool-pruning entry of the branch, later Epochs winning", () => {
    const state = masksFromBranch([
      customEntry(epochEntry(1, { a: "drop_result", b: "drop_result" })),
      { type: "message" },
      customEntry(epochEntry(2, { b: "drop_call" })),
      { type: "custom", customType: "something-else", data: epochEntry(3, { c: "drop_call" }) },
    ]);

    expect(state).toEqual({ masks: { a: "drop_result", b: "drop_call" }, lastEpochId: 2 });
  });

  it("ignores entries that do not match the schema", () => {
    const state = masksFromBranch([
      customEntry({ version: 2, epochId: 1, decisions: { a: "drop_call" } }),
      customEntry({ version: 1, epochId: 1, decisions: { a: "drop_everything" } }),
      customEntry("not an object"),
      { type: "custom", customType: TOOL_PRUNING_ENTRY_TYPE, data: null },
    ]);

    // The invalid decision value is skipped; the entry still counts as an
    // Epoch, which only keeps the id sequence of the branch monotonic.
    expect(state).toEqual({ masks: {}, lastEpochId: 1 });
  });

  it("forgets the masks of an abandoned branch after a Message Edit", async () => {
    const test = harness();
    // A branch that carries one persisted Epoch for `t1-1`.
    test.branch.push(customEntry(epochEntry(7, { "t1-1": "drop_result" })));
    const messages = session(20_000);

    const masked = await test.runner.onContext(messages);
    expect(masked.messages).not.toBe(messages);
    expect(JSON.stringify(masked.messages)).toContain("Tool Pruning: omitted");

    // Message Edit: the leaf moves back and the Epoch entry is no longer on
    // the branch, so the original result is restored for the model.
    test.branch.length = 0;
    test.moveLeaf("leaf-rewound");
    const rewritten = [...messages];
    rewritten[0] = user("Implement the parser, take two");
    const restored = await test.runner.onContext(rewritten);

    expect(JSON.stringify(restored.messages)).not.toContain("Tool Pruning: omitted");
  });

  it("memoises the branch read by leaf id and continues the Epoch counter", async () => {
    const calls: number[] = [];
    const branch: ToolPruningSessionEntry[] = [customEntry(epochEntry(7, {}))];
    let leafId: string | null = "leaf-a";
    const appended: ToolPruningEpochEntry[] = [];
    let judgeCalls = 0;

    const runner = new ToolPruningEpochRunner({
      cwd: CWD,
      config: { ...BASE_CONFIG },
      getContextWindow: () => WINDOW,
      getCredentials: async () => ({ baseUrl: "http://127.0.0.1:4000/v1" }),
      getBranch: () => {
        calls.push(1);
        return branch;
      },
      getLeafId: () => leafId,
      appendEntry: (_customType, entry) => {
        appended.push(entry);
        branch.push(customEntry(entry));
        leafId = `leaf-${appended.length}`;
      },
      judge: async (request: SystemOneDecisionRequest) => {
        judgeCalls += 1;
        return okJudge(answersOf(request, 0.1));
      },
    });

    // Two context calls on the same leaf: one branch read.
    await runner.onContext(session(20_000));
    await runner.onContext(session(20_000));
    expect(calls).toHaveLength(1);

    // The branch left by the persisted Epoch reports id 7, so the next
    // persisted Epoch continues the sequence.
    runner.beginTurn();
    await runner.onContext(session(50_000));
    expect(judgeCalls).toBe(1);
    expect(appended).toHaveLength(1);
    expect(appended[0].epochId).toBe(8);

    // Persisting moved the leaf: the next projection rebuilds from the branch.
    await runner.onContext(session(50_000));
    expect(calls).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

describe("config", () => {
  it("merges overrides over the spec defaults", () => {
    const runner = new ToolPruningEpochRunner({
      cwd: CWD,
      config: { softWatermarkRatio: 0.5 },
    });

    expect(runner.config.softWatermarkRatio).toBe(0.5);
    expect(runner.config.hardWatermarkRatio).toBe(
      DEFAULT_TOOL_PRUNING_CONFIG.hardWatermarkRatio,
    );
  });
});
