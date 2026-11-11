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
  consumedWatermarkStep,
  estimateActiveTokens,
  masksFromBranch,
  measureProjection,
  nextWatermarkStep,
  watermarkSteps,
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
const SESSION_ID = "session-1";

/**
 * Test config: the spec defaults except for the Cooling Window, which is
 * collapsed so a short fixture still exposes every Turn as evaluable.
 */
const BASE_CONFIG: ToolPruningConfigOverrides = {
  coolingRecentTokens: 0,
  minCoolingToolCalls: 0,
  maxProtectedTurnTokens: 0,
};

const usage = (totalTokens: number): AssistantMessage["usage"] => ({
  input: totalTokens,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});

const user = (content: string): AgentMessage => ({ role: "user", content, timestamp: 1 });

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
/** One completed tool turn: `count` bash pairs, all worth 10 000 tokens. */
const bashTurn = (prefix: string, count: number): AgentMessage[] =>
  Array.from({ length: count }, (_, index) => {
    const id = `${prefix}-${index + 1}`;
    return [assistant([bash(id, `pnpm task-${id}`)]), bashResult(id)];
  }).flat();

/**
 * A session shaped like the spec: an old exploration turn and the active turn
 * whose assistant reported `activeTokens` (60 000 tokens of prunable pool).
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
  return async (request) => okJudge(answersOf(request, probability));
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
  /** Appends a `compaction` entry to the branch, as Pi does after summarising. */
  compact(): void;
  /** Replaces the turn abort signal the runner observes. */
  setSignal(signal: AbortSignal | undefined): void;
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
  let signal: AbortSignal | undefined;

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
    getSessionId: () => SESSION_ID,
    getTraceLogger: () => trace,
    getSignal: () => signal,
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
    compact() {
      branch.push({ type: "compaction" });
      leafCounter += 1;
      leafId = `leaf-compaction-${leafCounter}`;
    },
    setSignal(next: AbortSignal | undefined) {
      signal = next;
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
// Watermark staircase (D3)
// ---------------------------------------------------------------------------

describe("watermark staircase", () => {
  it("sorts the configured steps and de-duplicates them", () => {
    expect(watermarkSteps([0.75, 0.45, 0.6, 0.6])).toEqual([0.45, 0.6, 0.75]);
    expect(watermarkSteps([0, Number.NaN, 0.5])).toEqual([0.5]);
  });

  it("arms the lowest step above the highest consumed one", () => {
    const steps = watermarkSteps(DEFAULT_TOOL_PRUNING_CONFIG.watermarks);
    expect(nextWatermarkStep(steps, 0)).toBe(0.45);
    expect(nextWatermarkStep(steps, 0.45)).toBe(0.6);
    expect(nextWatermarkStep(steps, 0.6)).toBe(0.75);
    expect(nextWatermarkStep(steps, 0.75)).toBeUndefined();
  });

  it("consumes the highest step the context already reached", () => {
    const steps = watermarkSteps(DEFAULT_TOOL_PRUNING_CONFIG.watermarks);
    expect(consumedWatermarkStep(steps, 50_000, WINDOW)).toBe(0.45);
    expect(consumedWatermarkStep(steps, 62_000, WINDOW)).toBe(0.6);
    expect(consumedWatermarkStep(steps, 80_000, WINDOW)).toBe(0.75);
  });
});

// ---------------------------------------------------------------------------
// Token accounting (D3)
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

  it("skips aborted assistant messages, which carry no usable usage", () => {
    const messages: AgentMessage[] = [
      user("abcd"),
      prose("aborted", { usage: usage(50_000), stopReason: "aborted" }),
    ];

    expect(estimateActiveTokens(messages)).toBe(1 + 2);
  });
});

describe("measureProjection", () => {
  const config = { ...DEFAULT_TOOL_PRUNING_CONFIG, ...BASE_CONFIG };

  it("subtracts the reductions applied before the last usage boundary", () => {
    const messages: AgentMessage[] = [
      user("read it"),
      assistant([bash("t1", "pnpm test")]),
      bashResult("t1"),
      prose("done", { usage: usage(50_000) }),
    ];

    const measurement = measureProjection(messages, { t1: "drop_result" }, config);

    // 10 000 result tokens became a ~105-token stub: the stale usage must not
    // keep reporting the pruned body.
    expect(measurement.hasUsage).toBe(true);
    expect(measurement.removedBeforeUsage).toBeGreaterThan(9_500);
    expect(measurement.activeTokens).toBeGreaterThan(39_000);
    expect(measurement.activeTokens).toBeLessThan(41_000);
    // The plain estimator would still report the stale 50 000: only the runner
    // knows how much of that prefix the mask removed.
    expect(estimateActiveTokens(measurement.messages)).toBe(50_000);
  });

  it("does not subtract reductions that happen after the usage boundary", () => {
    const messages: AgentMessage[] = [
      user("go"),
      prose("answer", { usage: usage(50_000) }),
      assistant([bash("t1", "pnpm test")]),
      bashResult("t1"),
    ];

    const measurement = measureProjection(messages, { t1: "drop_result" }, config);

    // Everything after the boundary is estimated from scratch, so the plain
    // estimator over the masked projection is already exact.
    expect(measurement.removedBeforeUsage).toBe(0);
    expect(measurement.activeTokens).toBe(estimateActiveTokens(measurement.messages));
    expect(measurement.activeTokens).toBeGreaterThan(50_000);
  });

  it("subtracts a dropped call block from its own assistant message", () => {
    const messages: AgentMessage[] = [
      user("search"),
      assistant([grep("g1", "alpha")]),
      grepResult("g1"),
      prose("done", { usage: usage(50_000) }),
    ];

    const measurement = measureProjection(messages, { g1: "drop_call" }, config);

    expect(measurement.messages).toHaveLength(2);
    expect(measurement.removedBeforeUsage).toBeGreaterThan(10_000);
    expect(measurement.activeTokens).toBeLessThan(40_000);
  });

  it("falls back to a full estimate when there is no usage to correct", () => {
    const messages: AgentMessage[] = [user("go"), assistant([bash("t1", "x")]), bashResult("t1")];

    const measurement = measureProjection(messages, { t1: "drop_result" }, config);

    expect(measurement.hasUsage).toBe(false);
    expect(measurement.activeTokens).toBeLessThan(1_000);
  });
});

// ---------------------------------------------------------------------------
// Triggers (D3)
// ---------------------------------------------------------------------------

describe("Tool Pruning triggers", () => {
  it("does nothing below the next watermark, even with a huge pool", async () => {
    const test = harness();

    // 44 000 tokens (0.44) of a 100 000 window, 90 000 prunable tokens: the
    // step is what gates the Epoch, not the size of the pool.
    await test.runner.onContext(session(44_000, 3));

    expect(test.judge).not.toHaveBeenCalled();
    expect(test.appends).toHaveLength(0);
  });

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

    const projection = await test.runner.onContext(messages);

    expect(test.judge).not.toHaveBeenCalled();
    expect(test.appends).toHaveLength(0);
    expect(projection.changed).toBe(false);
  });

  it("walks the staircase monotonically: 0.45, then 0.60, then 0.75", async () => {
    const test = harness();
    // Keep everything: the pool is unchanged, so only the staircase can fire.
    test.answerWith(1);

    await test.runner.onContext(session(50_000));
    expect(test.judge).toHaveBeenCalledTimes(1);
    expect(test.appends[0].entry.watermark).toBe(0.45);

    // Same context: the consumed step is spent, and 0.60 is not reached yet.
    await test.runner.onContext(session(50_000));
    expect(test.judge).toHaveBeenCalledTimes(1);

    await test.runner.onContext(session(62_000));
    expect(test.judge).toHaveBeenCalledTimes(2);
    expect(test.appends[1].entry.watermark).toBe(0.6);

    await test.runner.onContext(session(70_000));
    expect(test.judge).toHaveBeenCalledTimes(2);

    await test.runner.onContext(session(76_000));
    expect(test.judge).toHaveBeenCalledTimes(3);
    expect(test.appends[2].entry.watermark).toBe(0.75);
  });

  it("firing at 0.60 retires 0.45 and 0.60, so dropping to 50% does not retrigger", async () => {
    const test = harness();
    test.answerWith(1);

    // Straight to 0.62: the Epoch consumes the highest satisfied step (0.60).
    await test.runner.onContext(session(62_000));
    expect(test.appends).toHaveLength(1);
    expect(test.appends[0].entry.watermark).toBe(0.6);
    expect(test.runner.consumedWatermark).toBe(0.6);

    // A prune that only reclaimed a little still retired 0.45 and 0.60: the
    // next Turns at 50-58% must not run another Epoch.
    await test.runner.onContext(session(50_000));
    await test.runner.onContext(session(54_000));
    await test.runner.onContext(session(58_000));
    expect(test.judge).toHaveBeenCalledTimes(1);
    expect(test.appends).toHaveLength(1);

    // Only the next, strictly higher step fires.
    await test.runner.onContext(session(76_000));
    expect(test.judge).toHaveBeenCalledTimes(2);
    expect(test.appends[1].entry.watermark).toBe(0.75);
  });

  it("never triggers without a resolved model", async () => {
    const judge = vi.fn();
    const runner = new ToolPruningEpochRunner({
      cwd: CWD,
      config: { ...BASE_CONFIG },
      getContextWindow: () => undefined,
      judge,
      appendEntry: () => {
        throw new Error("must not persist without a model");
      },
    });

    const projection = await runner.onContext(session(90_000));

    expect(judge).not.toHaveBeenCalled();
    expect(projection.changed).toBe(false);
  });

  it("never triggers on a zero window", async () => {
    const judge = vi.fn();
    const runner = new ToolPruningEpochRunner({
      cwd: CWD,
      config: { ...BASE_CONFIG },
      getContextWindow: () => 0,
      judge,
      appendEntry: () => {
        throw new Error("must not persist without a window");
      },
    });

    await runner.onContext(session(90_000));

    expect(judge).not.toHaveBeenCalled();
  });

  it("corrects the stale usage before choosing the step to consume", async () => {
    const test = harness();
    test.answerWith(1);
    // One already-persisted drop of a 10 000-token result.
    test.branch.push(customEntry(epochEntry(1, { "t1-1": "drop_result" }, 0.01)));

    // The provider reported 62 000 tokens, but 10 000 of them are pruned now.
    await test.runner.onContext(session(62_000));

    expect(test.judge).toHaveBeenCalledTimes(1);
    // ~52 100 corrected tokens reach 0.45 only: consuming 0.60 would burn a
    // KV-cache break the session does not need yet.
    expect(test.appends[0].entry.watermark).toBe(0.45);
  });
});

// ---------------------------------------------------------------------------
// Phase 0 short-circuit (D5)
// ---------------------------------------------------------------------------

const HUGE = "z".repeat(100_000); // 25 000 estimated tokens

describe("Phase 0 short-circuit", () => {
  it("persists the entry without any network call when Phase 0 relieves the pressure", async () => {
    const test = harness();
    const messages: AgentMessage[] = [
      user("read it"),
      assistant([read("r1", "src/app.ts")]),
      readResult("r1", HUGE),
      assistant([read("r2", "src/app.ts")]),
      readResult("r2", HUGE),
      assistant([bash("b1", "pnpm test")]),
      bashResult("b1"),
      user("next"),
      prose("done", { usage: usage(50_000) }),
    ];

    const projection = await test.runner.onContext(messages);

    expect(test.judge).not.toHaveBeenCalled();
    expect(test.appends).toHaveLength(1);
    const entry = test.appends[0].entry;
    expect(entry.watermark).toBe(0.45);
    expect(entry.decisions).toEqual({ r1: "drop_call" });
    expect(entry.stats.batches).toBe(0);
    expect(entry.stats.deterministicDrops).toBe(1);
    expect(entry.stats.judgeDrops).toBe(0);
    // The duplicate read disappeared: its call block emptied the assistant
    // message (which is then omitted) and its result went with it.
    expect(projection.messages).toHaveLength(messages.length - 2);
  });

  it("skips the judge when Phase 0 left less than minJudgeWorthwhileTokens", async () => {
    const test = harness();
    const messages: AgentMessage[] = [
      user("read it"),
      assistant([read("r1", "src/app.ts")]),
      readResult("r1", HUGE),
      // A cheap re-read supersedes it and leaves only ~120 tokens in the pool.
      assistant([read("r2", "src/app.ts")]),
      readResult("r2", "z".repeat(480)),
      user("next"),
      prose("done", { usage: usage(90_000) }),
    ];

    await test.runner.onContext(messages);

    // 65 000 tokens after Phase 0 are still above the 30% line, so it is the
    // shrunk pool that makes the HTTP call pointless.
    expect(test.judge).not.toHaveBeenCalled();
    expect(test.appends).toHaveLength(1);
    expect(test.appends[0].entry.decisions).toEqual({ r1: "drop_call" });
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

    const projection = await test.runner.onContext(messages);

    expect(test.appends).toHaveLength(1);
    expect(test.appends[0].customType).toBe(TOOL_PRUNING_ENTRY_TYPE);
    const entry = test.appends[0].entry;
    expect(entry).toMatchObject({
      version: 1,
      epochId: 1,
      watermark: 0.45,
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

  it("persists the consumed step even when the judge kept everything", async () => {
    const test = harness();
    test.answerWith(1);

    const projection = await test.runner.onContext(session(50_000));

    // The entry is what consumes the step: `keep` decides nothing, but the
    // session must not pay for the same step twice.
    expect(test.appends).toHaveLength(1);
    expect(test.appends[0].entry.decisions).toEqual({});
    expect(test.appends[0].entry.watermark).toBe(0.45);
    expect(test.appends[0].entry.tokensSavedEst).toBe(0);
    expect(projection.changed).toBe(false);
  });

  it("keeps the session untouched when the feature is disabled", async () => {
    const test = harness({ enabled: false });

    const projection = await test.runner.onContext(session(90_000));

    expect(test.judge).not.toHaveBeenCalled();
    expect(projection.changed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fail-open and abort (D6)
// ---------------------------------------------------------------------------

describe("Fail-open", () => {
  it("persists the consumed step so a degraded judge cannot retry-loop", async () => {
    const test = harness();
    test.failJudge();

    await test.runner.onContext(session(50_000));

    expect(test.judge).toHaveBeenCalledTimes(1);
    expect(test.appends).toHaveLength(1);
    const entry = test.appends[0].entry;
    expect(entry.decisions).toEqual({});
    expect(entry.watermark).toBe(0.45);
    expect(entry.stats.failedOpen).toBe(true);
    expect(test.events.map((event) => event.name)).toContain(
      "tool_pruning.epoch_failed_open",
    );

    // Same step, same context: no second request. The pool stays eligible for
    // the next step.
    await test.runner.onContext(session(50_000));
    expect(test.judge).toHaveBeenCalledTimes(1);

    await test.runner.onContext(session(62_000));
    expect(test.judge).toHaveBeenCalledTimes(2);
    expect(test.appends[1].entry.watermark).toBe(0.6);
  });

  it("persists the Phase 0 drops of a failed Epoch", async () => {
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

    await test.runner.onContext(messages);

    expect(test.appends).toHaveLength(1);
    const entry = test.appends[0].entry;
    expect(entry.decisions).toEqual({ r1: "drop_call" });
    expect(entry.stats.failedOpen).toBe(true);
    expect(entry.stats.deterministicDrops).toBe(1);
    expect(entry.stats.judgeDrops).toBe(0);
  });

  it("treats missing credentials as a fail-open Epoch", async () => {
    const test = harness();
    const runner = new ToolPruningEpochRunner({
      cwd: CWD,
      config: { ...BASE_CONFIG },
      getContextWindow: () => WINDOW,
      getCredentials: async () => undefined,
      appendEntry: (_customType, entry) => {
        test.appends.push({ customType: TOOL_PRUNING_ENTRY_TYPE, entry });
      },
      judge: test.judge,
    });

    await runner.onContext(session(50_000));

    expect(test.judge).not.toHaveBeenCalled();
    expect(test.appends).toHaveLength(1);
    expect(test.appends[0].entry.stats.failedOpen).toBe(true);
  });
});

describe("User abort", () => {
  it("persists nothing and does not consume the step", async () => {
    const test = harness();
    const controller = new AbortController();
    test.setSignal(controller.signal);
    test.judge.mockImplementation(async (request: SystemOneDecisionRequest) => {
      controller.abort();
      return okJudge(answersOf(request, 0.1));
    });

    const projection = await test.runner.onContext(session(50_000));

    expect(test.judge).toHaveBeenCalledTimes(1);
    expect(test.appends).toHaveLength(0);
    expect(test.runner.activeMasks).toEqual({});
    expect(test.runner.consumedWatermark).toBe(0);
    expect(projection.changed).toBe(false);

    // The cancelled Turn did not spend the step: the next attempt still runs.
    test.setSignal(undefined);
    test.answerWith(0.1);
    test.judge.mockImplementation(async (request: SystemOneDecisionRequest) =>
      okJudge(answersOf(request, 0.1)),
    );
    await test.runner.onContext(session(50_000));

    expect(test.judge).toHaveBeenCalledTimes(2);
    expect(test.appends).toHaveLength(1);
    expect(test.appends[0].entry.watermark).toBe(0.45);
  });
});

// ---------------------------------------------------------------------------
// Conservative drop band (D5 Phase 1.3)
// ---------------------------------------------------------------------------

describe("Conservative drop band", () => {
  it("keeps the uncertain [0.25, 0.50) band at every step", async () => {
    const test = harness();
    test.judge.mockImplementation(async (request: SystemOneDecisionRequest) =>
      okJudge(answersOf(request, 0.3)),
    );

    await test.runner.onContext(session(50_000));
    expect(test.judge).toHaveBeenCalledTimes(1);
    expect(test.appends[0].entry.decisions).toEqual({});

    await test.runner.onContext(session(80_000));
    expect(test.judge).toHaveBeenCalledTimes(2);
    expect(test.appends[1].entry.decisions).toEqual({});
    expect(test.appends[1].entry.watermark).toBe(0.75);
  });

  it("drops the high-confidence candidates of a high-pressure Epoch", async () => {
    const test = harness();
    test.answerWith(0.1);

    await test.runner.onContext(session(80_000));

    expect(test.appends).toHaveLength(1);
    expect(Object.values(test.appends[0].entry.decisions)).toEqual(
      Array(6).fill("drop_result"),
    );
    expect(test.appends[0].entry.watermark).toBe(0.75);
  });
});

// ---------------------------------------------------------------------------
// Branch-aware state reconstruction (D7)
// ---------------------------------------------------------------------------

function epochEntry(
  epochId: number,
  decisions: Record<string, "drop_result" | "drop_call">,
  watermark = 0.45,
): ToolPruningEpochEntry {
  return {
    version: 1,
    epochId,
    watermark,
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
  };
}

const customEntry = (data: unknown): ToolPruningSessionEntry => ({
  type: "custom",
  customType: TOOL_PRUNING_ENTRY_TYPE,
  data,
});

describe("branch-aware state", () => {
  it("merges every tool-pruning entry of the branch, later Epochs winning", () => {
    const state = masksFromBranch([
      customEntry(epochEntry(1, { a: "drop_result", b: "drop_result" })),
      { type: "message" },
      customEntry(epochEntry(2, { b: "drop_call" }, 0.6)),
      { type: "custom", customType: "something-else", data: epochEntry(3, { c: "drop_call" }) },
    ]);

    expect(state).toEqual({
      masks: { a: "drop_result", b: "drop_call" },
      lastEpochId: 2,
      highestConsumedWatermark: 0.6,
    });
  });

  it("ignores entries that do not match the schema", () => {
    const state = masksFromBranch([
      customEntry({ version: 2, epochId: 1, watermark: 0.75, decisions: { a: "drop_call" } }),
      customEntry({ version: 1, epochId: 1, watermark: 0.45, decisions: { a: "drop_everything" } }),
      customEntry("not an object"),
      { type: "custom", customType: TOOL_PRUNING_ENTRY_TYPE, data: null },
    ]);

    // The invalid decision value is skipped; the entry still counts as an
    // Epoch, which only keeps the id sequence and the staircase monotonic.
    expect(state).toEqual({ masks: {}, lastEpochId: 1, highestConsumedWatermark: 0.45 });
  });

  it("reads only the entries after the latest compaction", () => {
    const state = masksFromBranch([
      customEntry(epochEntry(4, { a: "drop_call" }, 0.75)),
      { type: "compaction" },
      customEntry(epochEntry(5, { b: "drop_result" }, 0.45)),
    ]);

    expect(state).toEqual({
      masks: { b: "drop_result" },
      lastEpochId: 5,
      highestConsumedWatermark: 0.45,
    });
  });

  it("forgets the masks and the consumed step of an abandoned branch", async () => {
    const test = harness();
    test.answerWith(1);
    // A branch that carries one persisted Epoch for `t1-1`.
    test.branch.push(customEntry(epochEntry(7, { "t1-1": "drop_result" })));

    const masked = await test.runner.onContext(session(20_000));
    expect(JSON.stringify(masked.messages)).toContain("Tool Pruning: omitted");
    expect(test.runner.consumedWatermark).toBe(0.45);

    // Message Edit: the leaf moves back and the Epoch entry is no longer on
    // the branch, so the original result is restored for the model and the
    // step is armed again.
    test.branch.length = 0;
    test.moveLeaf("leaf-rewound");
    const rewritten = session(20_000);
    rewritten[0] = user("Implement the parser, take two");
    const restored = await test.runner.onContext(rewritten);

    expect(JSON.stringify(restored.messages)).not.toContain("Tool Pruning: omitted");
    expect(test.runner.consumedWatermark).toBe(0);
  });

  it("rearms every step once a compaction entry lands on the branch", async () => {
    const test = harness();
    test.answerWith(1);

    await test.runner.onContext(session(80_000));
    expect(test.appends[0].entry.watermark).toBe(0.75);

    // Every step spent: nothing more can fire in this window cycle.
    await test.runner.onContext(session(99_000));
    expect(test.judge).toHaveBeenCalledTimes(1);

    // Pi compacts and rearms the staircase; the drop of the previous cycle is
    // gone with it.
    test.compact();
    await test.runner.onContext(session(50_000));

    expect(test.judge).toHaveBeenCalledTimes(2);
    expect(test.appends[1].entry.watermark).toBe(0.45);
    expect(test.runner.consumedWatermark).toBe(0.45);
  });

  it("memoises the branch read by (sessionId, leafId) and continues the Epoch counter", async () => {
    const calls: number[] = [];
    const branch: ToolPruningSessionEntry[] = [customEntry(epochEntry(7, {}, 0.01))];
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
      getSessionId: () => SESSION_ID,
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
    await runner.onContext(session(50_000));
    expect(judgeCalls).toBe(1);
    expect(appended).toHaveLength(1);
    expect(appended[0].epochId).toBe(8);

    // Persisting moved the leaf: the next projection rebuilds from the branch,
    // which now reports the consumed step, so nothing fires again.
    await runner.onContext(session(50_000));
    expect(calls).toHaveLength(2);
    expect(judgeCalls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

describe("config", () => {
  it("merges overrides over the spec defaults", () => {
    const runner = new ToolPruningEpochRunner({
      cwd: CWD,
      config: { watermarks: [0.5, 0.9] },
    });

    expect(runner.config.watermarks).toEqual([0.5, 0.9]);
    expect(DEFAULT_TOOL_PRUNING_CONFIG.watermarks).toEqual([0.45, 0.6, 0.75]);
  });
});
