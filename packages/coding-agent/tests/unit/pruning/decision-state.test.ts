import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOOL_PRUNING_CONFIG,
  NO_TOOL_PRUNING_SIGNALS,
  type AgentMessage,
  type ToolPruningConfig,
} from "../../../src/pruning/config";
import { partitionCoolingWindow } from "../../../src/pruning/cooling-window";
import {
  MAX_DECISION_REQUEST_TOKENS,
  applyDecisionPolicy,
  buildDecisionPlan,
  buildDecisionState,
  collectDecisionCandidates,
  decisionAnchor,
  estimateDecisionStateTokens,
  fitDecisionStateToBudget,
  planDecisionBatches,
  questionName,
  type DecisionCandidate,
  type DecisionCandidateEntry,
  type DecisionStateDocument,
} from "../../../src/pruning/decision-state";
import { assistant, call, configWith, toolResult, user } from "./fixtures";

// ---------------------------------------------------------------------------
// Message fixtures
// ---------------------------------------------------------------------------

interface CallSpec {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  /** Characters of result text; defaults to 4 000. */
  chars?: number;
  isError?: boolean;
}

/** One Turn: user prompt, assistant prose with every call, then its results. */
const turn = (prompt: string, calls: readonly CallSpec[], proseText?: string): AgentMessage[] => {
  const content = [];
  if (proseText !== undefined) content.push({ type: "text" as const, text: proseText });
  for (const spec of calls) content.push(call(spec.id, spec.tool, spec.args));
  const results = calls.map((spec) =>
    toolResult(spec.id, [
      {
        type: "text" as const,
        text: `${spec.id}-HEAD-${"x".repeat((spec.chars ?? 4_000) - 20)}${spec.id}-TAIL`,
      },
    ], { toolName: spec.tool, isError: spec.isError ?? false }),
  );
  return [user(prompt), assistant(content), ...results];
};

/**
 * A protection short enough that every call except the final one is a Living
 * Candidate: the tail keeps the last paired call and the Turn cap is collapsed
 * so the unified Cooling Window does not protect the active Turn either.
 */
const TINY_TAIL = configWith({
  coolingRecentTokens: 0,
  minCoolingToolCalls: 1,
  maxProtectedTurnTokens: 0,
});

const planFor = (messages: readonly AgentMessage[], config: Partial<ToolPruningConfig> = {}) => {
  const merged = { ...TINY_TAIL, ...config };
  const partition = partitionCoolingWindow(messages, { config: merged });
  return buildDecisionPlan({ messages, partition, config: merged });
};

const candidate = (
  id: string,
  overrides: Partial<DecisionCandidate> = {},
): DecisionCandidate => ({
  id,
  toolCallId: `call-${id}`,
  toolName: "read",
  arguments: { path: `src/${id}.ts` },
  chars: 4_000,
  tokensEst: 1_000,
  resultTokens: 950,
  callTokens: 50,
  isError: false,
  resultIndex: 0,
  eligibility: {
    dropResult: true,
    dropCall: true,
    requiresSupersessionOrJudge: false,
  },
  signals: NO_TOOL_PRUNING_SIGNALS,
  resultText: "x".repeat(4_000),
  ...overrides,
});

const bashCandidate = (id: string, overrides: Partial<DecisionCandidate> = {}): DecisionCandidate =>
  candidate(id, {
    toolName: "bash",
    arguments: { command: "pnpm test" },
    eligibility: {
      dropResult: true,
      dropCall: false,
      requiresSupersessionOrJudge: false,
    },
    ...overrides,
  });

// ---------------------------------------------------------------------------
// State construction
// ---------------------------------------------------------------------------

describe("buildDecisionState", () => {
  const exploreThenImplement = (): AgentMessage[] => [
    ...turn("Explore the repository", [
      { id: "r1", tool: "read", args: { path: "src/plan.ts" } },
      { id: "g1", tool: "grep", args: { pattern: "TODO" } },
    ]),
    ...turn("Discuss the plan wording", [], "Here is the wording we agreed on."),
    ...turn("Implement it now", [
      { id: "r2", tool: "read", args: { path: "src/plan.ts" }, chars: 8_000 },
      { id: "b1", tool: "bash", args: { command: "pnpm test" }, chars: 8_000 },
      { id: "r3", tool: "read", args: { path: "src/parser.ts" }, chars: 8_000 },
    ]),
  ];

  it("builds goal, protected digest and per-Turn timeline from the messages", () => {
    const messages = exploreThenImplement();
    const partition = partitionCoolingWindow(messages, {
      // Protect the last three results so the digest sees reads and a command.
      config: configWith({
        coolingRecentTokens: 0,
        minCoolingToolCalls: 3,
        maxProtectedTurnTokens: 0,
      }),
    });
    const candidates = collectDecisionCandidates(messages, partition);
    const state = buildDecisionState({ messages, partition, candidates });

    expect(state.goal.request).toBe("Implement it now");
    expect(state.goal.previous).toEqual(["Explore the repository", "Discuss the plan wording"]);
    expect(state.goal.assistantPlan).toBe("Here is the wording we agreed on.");
    expect(state.recentProtectedDigest.summary).toContain(
      "Preserved intact in the recent window",
    );
    expect(state.recentProtectedDigest.files).toEqual(["src/plan.ts", "src/parser.ts"]);
    expect(state.recentProtectedDigest.commands).toEqual(["pnpm test"]);

    // Turn 1 produced the plan reads; every turn keeps its prose digest.
    expect(state.timeline.turns.map((turn) => turn.turn)).toEqual([1, 2]);
    expect(state.timeline.turns[1].digest).toBe("Here is the wording we agreed on.");
    expect(state.timeline.turns[0].candidates).toEqual(["c1", "c2"]);
  });

  it("renders candidate args, flags and a head + tail preview", () => {
    const messages = exploreThenImplement();
    const partition = partitionCoolingWindow(messages, { config: TINY_TAIL });
    const first = partition.candidates[0];
    const candidates = collectDecisionCandidates(messages, partition, {
      [first.toolCallId]: { editedLater: true },
    });
    const state = buildDecisionState({ messages, partition, candidates });
    const entry = state.timeline.candidates.find(
      (candidate) => candidate.id === candidates[0].id,
    ) as DecisionCandidateEntry;

    expect(entry.tool).toBe(first.toolName);
    expect(entry.args).toContain('"path":"src/plan.ts"');
    expect(entry.chars).toBe(first.chars);
    expect(entry.tokensEst).toBe(first.tokensEst);
    expect(entry.editedLater).toBe(true);
    expect(entry.sameCommandRanLater).toBe(false);
    expect(entry.preview.startsWith("r1-HEAD-")).toBe(true);
    expect(entry.preview.endsWith("r1-TAIL")).toBe(true);
    expect(entry.preview).toContain(" … ");
    // head(200) + " … " + tail(200)
    expect(entry.preview.length).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// State budget
// ---------------------------------------------------------------------------

describe("fitDecisionStateToBudget", () => {
  const bigEntry: DecisionCandidateEntry = {
    id: "c1",
    tool: "read",
    args: JSON.stringify({ path: "src/app.ts", padding: "z".repeat(300) }),
    chars: 4_000,
    tokensEst: 1_010,
    isError: false,
    editedLater: false,
    sameCommandRanLater: false,
    laterCommandSucceeded: false,
    preview: `${"H".repeat(200)} … ${"T".repeat(200)}`,
  };

  const verboseState = (): DecisionStateDocument => ({
    goal: {
      request: "Implement the parser",
      previous: ["Explore the repository", "Discuss the plan"],
      assistantPlan: "Plan: rewrite the parser.",
    },
    recentProtectedDigest: {
      summary: "Preserved intact in the recent window: read src/app.ts.",
      files: ["src/app.ts"],
      mutatedFiles: [],
      commands: ["pnpm test"],
    },
    timeline: {
      turns: [
        // A huge Turn digest that also owns a candidate: step 1 skips it, the
        // second reduction step must shorten it before any candidate field.
        { turn: 1, digest: "p".repeat(40_000), mutations: [], candidates: ["c1"] },
        { turn: 2, digest: "q".repeat(40_000), mutations: [], candidates: [] },
      ],
      candidates: [bigEntry],
    },
  });

  it("estimates tokens with the spec's chars / 4 rule", () => {
    const state = verboseState();
    expect(estimateDecisionStateTokens(state)).toBe(
      Math.ceil(JSON.stringify(state).length / 4),
    );
  });

  it("compresses Turn prose first and leaves candidate args and preview untouched", () => {
    const state = verboseState();
    const fitted = fitDecisionStateToBudget(state, 2_000);

    expect(fitted.reductions).toContain("turn_digest");
    expect(fitted.reductions).toContain("turn_digest_with_candidates");
    for (const reduction of fitted.reductions) {
      expect(reduction.startsWith("candidate_")).toBe(false);
    }
    // The candidate entry survives byte for byte; only prose was compressed.
    expect(fitted.state.timeline.candidates[0]).toEqual(bigEntry);
    expect(fitted.state.timeline.turns[0].digest.length).toBeLessThanOrEqual(120);
    expect(fitted.state.timeline.turns[1].digest).toBe("");
  });

  it("reduces candidate args and preview only after every prose step", () => {
    const fitted = fitDecisionStateToBudget(verboseState(), 60);

    const firstCandidateStep = fitted.reductions.findIndex((step) =>
      step.startsWith("candidate_"),
    );
    expect(firstCandidateStep).toBeGreaterThan(-1);
    for (const step of fitted.reductions.slice(0, firstCandidateStep)) {
      expect(step.startsWith("candidate_")).toBe(false);
    }
    // Essential args keep the path that identifies the call, and the smallest
    // candidates are excluded rather than blowing the budget.
    const entry = fitted.state.timeline.candidates[0];
    if (entry !== undefined) expect(entry.args).toContain("src/app.ts");
    expect(fitted.excludedCandidateIds).toContain("c1");
    expect(estimateDecisionStateTokens(fitted.state)).toBeLessThanOrEqual(
      estimateDecisionStateTokens(verboseState()),
    );
  });

  it("does not mutate the input document", () => {
    const state = verboseState();
    const before = JSON.stringify(state);
    fitDecisionStateToBudget(state, 100);
    expect(JSON.stringify(state)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Question planning
// ---------------------------------------------------------------------------

describe("buildDecisionPlan questions", () => {
  it("asks two questions for successful exploratory calls and one for bash and bulky errors", () => {
    const messages = [
      ...turn("Explore", [
        { id: "r1", tool: "read", args: { path: "src/app.ts" } },
        { id: "b1", tool: "bash", args: { command: "pnpm test" } },
        { id: "e1", tool: "read", args: { path: "src/missing.ts" }, isError: true },
        { id: "r2", tool: "read", args: { path: "src/recent.ts" } },
      ]),
    ];
    const plan = planFor(messages);
    const questionsByCandidate = new Map<string, string[]>();
    for (const batch of plan.batches) {
      for (const [name, candidateId] of Object.entries(batch.owners)) {
        const names = questionsByCandidate.get(candidateId) ?? [];
        names.push(name);
        questionsByCandidate.set(candidateId, names);
      }
    }

    expect(plan.candidates.map((entry) => `${entry.id}:${entry.toolName}`)).toEqual([
      "c1:read",
      "c2:bash",
      "c3:read",
    ]);
    expect(questionsByCandidate.get("c1")).toEqual([
      questionName("call", "c1"),
      questionName("result", "c1"),
    ]);
    expect(questionsByCandidate.get("c2")).toEqual([questionName("result", "c2")]);
    expect(questionsByCandidate.get("c3")).toEqual([questionName("result", "c3")]);
  });

  it("anchors the criteria in the goal and the Phase 0 signals", () => {
    const messages = [
      ...turn("Implement the parser", [
        { id: "r1", tool: "read", args: { path: "src/app.ts" } },
        { id: "b1", tool: "bash", args: { command: "pnpm test" } },
        { id: "r2", tool: "read", args: { path: "src/recent.ts" } },
      ]),
    ];
    const merged = { ...TINY_TAIL };
    const partition = partitionCoolingWindow(messages, { config: merged });
    const plan = buildDecisionPlan({
      messages,
      partition,
      config: merged,
      signals: {
        r1: { editedLater: true },
        b1: { sameCommandRanLater: true, laterCommandSucceeded: true },
      },
    });

    const result = plan.batches[0].questions[questionName("result", "c1")];
    expect(result.criteria.true).toContain("Implement the parser");
    expect(result.criteria.false).toContain("modified afterwards");

    const command = plan.batches[0].questions[questionName("result", "c2")];
    expect(command.criteria.false).toContain("succeeded afterwards");
  });
});

// ---------------------------------------------------------------------------
// Batching
// ---------------------------------------------------------------------------

describe("planDecisionBatches", () => {
  const anchor = { goal: "Implement the parser", digest: "recent reads preserved" };

  it("prioritises the largest and oldest candidates and leaves the rest in keep", () => {
    const candidates = [
      bashCandidate("c1", { tokensEst: 250, resultIndex: 1 }),
      bashCandidate("c2", { tokensEst: 500, resultIndex: 2 }),
      bashCandidate("c3", { tokensEst: 750, resultIndex: 3 }),
      bashCandidate("c4", { tokensEst: 1_000, resultIndex: 4 }),
      bashCandidate("c5", { tokensEst: 1_250, resultIndex: 5 }),
    ];
    const config = configWith({ maxQuestionsPerBatch: 2, maxDecisionBatches: 2 });
    const plan = planDecisionBatches(candidates, anchor, { stateTokens: 1_000, config });

    expect(plan.batches).toHaveLength(2);
    expect(plan.batches[0].candidateIds).toEqual(["c5", "c4"]);
    expect(plan.batches[1].candidateIds).toEqual(["c3", "c2"]);
    expect(plan.leftovers.map((entry) => entry.id)).toEqual(["c1"]);
    for (const batch of plan.batches) {
      expect(Object.keys(batch.questions)).toHaveLength(2);
      expect(batch.questionTokens + 1_000).toBeLessThanOrEqual(
        MAX_DECISION_REQUEST_TOKENS,
      );
    }
  });

  it("splits by question count when exploratory calls need two questions each", () => {
    const candidates = [candidate("c1"), candidate("c2"), candidate("c3")];
    const config = configWith({ maxQuestionsPerBatch: 4, maxDecisionBatches: 3 });
    const plan = planDecisionBatches(candidates, anchor, { stateTokens: 0, config });

    expect(plan.batches).toHaveLength(2);
    expect(Object.keys(plan.batches[0].questions)).toHaveLength(4);
    expect(Object.keys(plan.batches[1].questions)).toHaveLength(2);
    expect(plan.leftovers).toEqual([]);
  });

  it("keeps the state plus questions under the Gateway's 28k ceiling", () => {
    const candidates = Array.from({ length: 4 }, (_, index) =>
      bashCandidate(`c${index + 1}`, { tokensEst: 2_000 }),
    );
    const config = configWith({ maxQuestionsPerBatch: 80, maxDecisionBatches: 3 });
    const stateTokens = MAX_DECISION_REQUEST_TOKENS - 99;
    const plan = planDecisionBatches(candidates, anchor, { stateTokens, config });

    for (const batch of plan.batches) {
      expect(batch.questionTokens + stateTokens).toBeLessThanOrEqual(
        MAX_DECISION_REQUEST_TOKENS,
      );
    }
    // A single question (100 tokens) does not fit the 99-token remainder:
    // nothing is asked and every candidate stays keep.
    expect(plan.batches).toEqual([]);
    expect(plan.leftovers).toHaveLength(4);
  });

  it("never opens more than maxDecisionBatches concurrent requests", () => {
    const candidates = Array.from({ length: 10 }, (_, index) =>
      bashCandidate(`c${index + 1}`),
    );
    const config = configWith({ maxQuestionsPerBatch: 1, maxDecisionBatches: 3 });
    const plan = planDecisionBatches(candidates, anchor, { stateTokens: 0, config });

    expect(plan.batches).toHaveLength(3);
    expect(plan.leftovers).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// Conservative drop policy
// ---------------------------------------------------------------------------

describe("applyDecisionPolicy", () => {
  it("keeps the whole uncertain band and only drops below 0.25", () => {
    const candidates = [
      candidate("c1"), // 0.30 >= 0.25 -> keep
      candidate("c2"), // 0.20 and call 0.10 -> drop_call
      candidate("c3"), // 0.20 and call 0.20 -> drop_result
      bashCandidate("c4", { resultTokens: 900 }), // bash: drop_result only
      candidate("c5", { eligibility: { dropResult: false, dropCall: true, requiresSupersessionOrJudge: false } }), // short result, missing answers -> keep
      candidate("c6"), // exactly 0.25 -> keep
      candidate("c7"), // invalid answer -> keep
    ];
    const answers: Record<string, number> = {
      "result_c1": 0.3,
      "result_c2": 0.2,
      "call_c2": 0.1,
      "result_c3": 0.2,
      "call_c3": 0.2,
      "result_c4": 0.2,
      "result_c6": 0.25,
      "result_c7": Number.NaN,
    };

    const outcome = applyDecisionPolicy(candidates, answers, { activeTokens: 60_000 });

    expect(outcome.decisions).toEqual({
      "call-c2": "drop_call",
      "call-c3": "drop_result",
      "call-c4": "drop_result",
    });
    expect(outcome.kept).toEqual(["call-c1", "call-c5", "call-c6", "call-c7"]);
    expect(outcome.highConfidenceDrops).toEqual(["call-c2", "call-c3", "call-c4"]);
  });

  it("never drops the call of bash even when only a call question were answered", () => {
    const candidates = [bashCandidate("c1")];
    const outcome = applyDecisionPolicy(
      candidates,
      { "result_c1": 0.2, "call_c1": 0.05 },
      { activeTokens: 10_000 },
    );
    expect(outcome.decisions).toEqual({ "call-c1": "drop_result" });
  });

  it("keeps the uncertain [0.25, 0.50) band at every watermark step", () => {
    const candidates = [
      candidate("c1", { tokensEst: 16_000, resultTokens: 16_000, resultIndex: 1 }),
      candidate("c2", { tokensEst: 2_000, resultTokens: 1_900, resultIndex: 5 }),
    ];
    // A step decides *when* the Epoch runs, never how aggressive it is: even a
    // context above the last watermark keeps the uncertain band intact.
    const outcome = applyDecisionPolicy(
      candidates,
      { "result_c1": 0.3, "call_c1": 0.05, "result_c2": 0.28 },
      { activeTokens: 90_000 },
    );

    expect(outcome.decisions).toEqual({});
    expect(outcome.highConfidenceDrops).toEqual([]);
    expect(outcome.kept).toEqual(["call-c1", "call-c2"]);
    expect(outcome.projectedTokens).toBe(90_000);
  });

  it("drops every high-confidence candidate of the batch at once", () => {
    const candidates = [
      candidate("c1", { tokensEst: 3_000, resultTokens: 3_000 }),
      candidate("c2", { tokensEst: 16_000, resultTokens: 16_000 }),
    ];
    const outcome = applyDecisionPolicy(
      candidates,
      { "result_c1": 0.1, "call_c1": 0.1, "result_c2": 0.2, "call_c2": 0.2 },
      { activeTokens: 90_000 },
    );

    expect(outcome.highConfidenceDrops).toEqual(["call-c1", "call-c2"]);
    expect(outcome.decisions).toEqual({
      "call-c1": "drop_call",
      "call-c2": "drop_result",
    });
    expect(outcome.kept).toEqual([]);
    expect(outcome.projectedTokens).toBe(90_000 - 3_000 - 16_000);
  });

  it("keeps every candidate when the judge returns no answers at all", () => {
    const candidates = [candidate("c1"), bashCandidate("c2")];
    const outcome = applyDecisionPolicy(candidates, {}, { activeTokens: 50_000 });
    expect(outcome.decisions).toEqual({});
    expect(outcome.kept).toEqual(["call-c1", "call-c2"]);
  });
});

// ---------------------------------------------------------------------------
// Plan composition
// ---------------------------------------------------------------------------

describe("buildDecisionPlan", () => {
  it("offers the batched candidates to the judge and leaves the rest in keep", () => {
    const messages = [
      ...turn("Explore", [
        { id: "b1", tool: "bash", args: { command: "pnpm test" } },
        { id: "b2", tool: "bash", args: { command: "pnpm lint" } },
        { id: "b3", tool: "bash", args: { command: "pnpm verify" } },
        { id: "r1", tool: "read", args: { path: "src/recent.ts" } },
      ]),
    ];
    const plan = planFor(messages, { maxQuestionsPerBatch: 2, maxDecisionBatches: 1 });

    expect(plan.batches).toHaveLength(1);
    // The oldest of the equally sized commands wins the tie and the newest is
    // left in the Living Pool.
    expect(plan.leftovers.map((entry) => entry.id)).toEqual(["c2"]);
    expect(plan.state.timeline.candidates.map((entry) => entry.id).sort()).toEqual(
      [...plan.batches[0].candidateIds].sort(),
    );
    // The state never repeats a leftover candidate that was not sent.
    expect(plan.stateTokens).toBe(estimateDecisionStateTokens(plan.state));
  });

  it("builds an empty plan when the Cooling Window protects everything", () => {
    const messages = [
      user("Explore"),
      assistant([call("r1", "read", { path: "src/app.ts" })]),
      toolResult("r1", [{ type: "text", text: "x".repeat(8_000) }]),
    ];
    const partition = partitionCoolingWindow(messages, {
      config: DEFAULT_TOOL_PRUNING_CONFIG,
    });
    expect(partition.candidates).toEqual([]);

    const plan = buildDecisionPlan({ messages, partition });
    expect(plan.candidates).toEqual([]);
    expect(plan.batches).toEqual([]);
    expect(plan.leftovers).toEqual([]);
    expect(plan.state.goal.request).toBe("Explore");
  });

  it("exposes the anchor used by the criteria", () => {
    const messages = [
      ...turn("Implement the parser", [
        { id: "r1", tool: "read", args: { path: "src/app.ts" } },
        { id: "r2", tool: "read", args: { path: "src/recent.ts" } },
      ]),
    ];
    const plan = planFor(messages);
    const anchor = decisionAnchor(plan.state);
    expect(anchor.goal).toBe("Implement the parser");
    expect(anchor.digest.length).toBeGreaterThan(0);
  });
});
