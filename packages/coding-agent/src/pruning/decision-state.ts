/**
 * Decision state, `noul` questions, batching and the two-band policy
 * (spec D5 Phase 1 and the D6 defaults).
 *
 * Instead of sending the raw transcript and truncating the tool arguments
 * first, the judge receives a compact structured document: the goal of the
 * session, a digest of what the Cooling Window already preserves intact, one
 * line per Turn and one entry per Living Candidate with a head + tail preview
 * of its result. `args` and `preview` are the last fields the budget reduces,
 * because they are the only thing that lets the judge tell a noisy log from a
 * key finding.
 *
 * The questions are `noul` (calibrated probability in `[0, 1]`) and only ask
 * what the per-tool policy can act on: exploratory calls get `call_<id>` and
 * `result_<id>`, `bash` and bulky errors get a single `result_<id>`. Answers
 * are consumed asymmetrically: normal Epochs only drop below `0.25` (the whole
 * uncertain `[0.25, 0.50)` band is kept to avoid regret), and only the
 * intra-Turn emergency valve may extend `drop_result`-only into `[0.25, 0.40)`.
 * A missing or invalid answer is probability `1.0` (`keep`), the fail-open
 * default.
 *
 * Everything here is pure and dependency-light: Pi loads the extension through
 * jiti in its own module runtime, so this module must never import worker
 * `src/` code, and Phase 0 (ticket 04) feeds its structural signals in through
 * `signals` instead of being imported.
 */
import {
  DEFAULT_TOOL_PRUNING_CONFIG,
  type AgentMessage,
  type ToolPruningConfig,
  type ToolPruningDrop,
} from "./config";
import {
  toolPolicyFor,
  type CoolingWindowPartition,
  type PruningEligibility,
} from "./cooling-window";
import { toolResultText } from "./mask";

// ---------------------------------------------------------------------------
// Budgets and limits (spec D5 Phase 1)
// ---------------------------------------------------------------------------

/** Characters kept from the latest `UserMessage` (the goal). */
export const GOAL_MAIN_MAX_CHARS = 1_500;
/** How many previous `UserMessage`s join the goal. */
export const GOAL_PREVIOUS_MESSAGES = 2;
/** Characters kept from each previous `UserMessage`. */
export const GOAL_PREVIOUS_MAX_CHARS = 500;
/** Characters kept from the compaction extract and the assistant plan. */
export const GOAL_CONTEXT_MAX_CHARS = 800;
/** Characters of prose kept per Turn digest. */
export const TURN_DIGEST_MAX_CHARS = 300;
/** Characters of tool arguments kept per candidate. */
export const QUESTION_ARG_MAX_CHARS = 400;
/** Characters of result head kept in a candidate preview. */
export const PREVIEW_HEAD_CHARS = 200;
/** Characters of result tail kept in a candidate preview. */
export const PREVIEW_TAIL_CHARS = 200;
/** Hard ceiling of `state + questions` for one `/v1/systemone` request. */
export const MAX_DECISION_REQUEST_TOKENS = 28_000;
/**
 * Context ratio above which the emergency Epoch extends into the uncertain
 * band. Below it the emergency Epoch applies only high-confidence drops.
 */
export const EMERGENCY_EXTEND_TRIGGER_RATIO = 0.6;
/** Anchor characters the question criteria are allowed to quote. */
const ANCHOR_GOAL_CHARS = 200;
const ANCHOR_DIGEST_CHARS = 160;
/** Digest length a turn keeps once the state budget starts compressing prose. */
const COMPRESSED_TURN_DIGEST_CHARS = 120;
/** Argument length used when a candidate's args keep only essential keys. */
const ESSENTIAL_ARG_MAX_CHARS = 200;

// ---------------------------------------------------------------------------
// Structural signals from Phase 0
// ---------------------------------------------------------------------------

/**
 * Deterministic supersession facts Phase 0 (ticket 04) annotates on surviving
 * candidates. They are shown to the judge so its `criteria` can lean on them.
 */
export interface Phase0Signals {
  /** The read path was modified later by a successful `edit`/`write`. */
  editedLater: boolean;
  /** The same normalized `bash` command ran again later in the session. */
  sameCommandRanLater: boolean;
  /** That later run of the same command succeeded. */
  laterCommandSucceeded: boolean;
}

/** Signals of a candidate Phase 0 could not supersede, with nothing to report. */
export const NO_PHASE0_SIGNALS: Readonly<Phase0Signals> = Object.freeze({
  editedLater: false,
  sameCommandRanLater: false,
  laterCommandSucceeded: false,
});

// ---------------------------------------------------------------------------
// Candidate model
// ---------------------------------------------------------------------------

/**
 * One Living Candidate ready for the decision phase: the partition facts plus
 * the tool arguments, the result text and the Phase 0 signals the state and
 * the questions need.
 */
export interface DecisionCandidate {
  /** Short stable id (`c1`, `c2`, …) used in the state and question names. */
  readonly id: string;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  /** Characters of result text; images excluded. */
  readonly chars: number;
  /** Ceiling of the tokens dropping the pair saves. */
  readonly tokensEst: number;
  /** Tokens of the result body; what `drop_result` saves. */
  readonly resultTokens: number;
  /** Tokens of the `ToolCall` block. */
  readonly callTokens: number;
  readonly isError: boolean;
  /** Index of the paired result in `messages`; also the chronology key. */
  readonly resultIndex: number;
  readonly eligibility: PruningEligibility;
  readonly signals: Phase0Signals;
  /** Raw result text the preview is built from. */
  readonly resultText: string;
}

/**
 * Collects the partition's candidates in chronology order and enriches them
 * with the tool arguments, result text and Phase 0 signals.
 *
 * Candidates whose call block or result message is missing from `messages` are
 * skipped defensively: the pairing invariant forbids pruning them anyway.
 */
export function collectDecisionCandidates(
  messages: readonly AgentMessage[],
  partition: CoolingWindowPartition,
  signals: Readonly<Record<string, Partial<Phase0Signals>>> = {},
): DecisionCandidate[] {
  if (partition.candidates.length === 0) return [];
  const calls = indexToolCalls(messages);

  const candidates: DecisionCandidate[] = [];
  for (const candidate of partition.candidates) {
    const block = calls.get(candidate.toolCallId);
    const result = messages[candidate.resultIndex];
    if (block === undefined || result === undefined || result.role !== "toolResult") continue;
    candidates.push({
      id: `c${candidates.length + 1}`,
      toolCallId: candidate.toolCallId,
      toolName: candidate.toolName,
      arguments: block.arguments,
      chars: candidate.chars,
      tokensEst: candidate.tokensEst,
      resultTokens: candidate.resultTokens,
      callTokens: candidate.callTokens,
      isError: candidate.isError,
      resultIndex: candidate.resultIndex,
      eligibility: candidate.eligibility,
      signals: { ...NO_PHASE0_SIGNALS, ...signals[candidate.toolCallId] },
      resultText: toolResultText(result),
    });
  }
  return candidates;
}

/** Tool call blocks indexed by `toolCallId`, first occurrence wins. */
function indexToolCalls(
  messages: readonly AgentMessage[],
): Map<string, { name: string; arguments: Record<string, unknown> }> {
  const calls = new Map<string, { name: string; arguments: Record<string, unknown> }>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const block of message.content) {
      if (block.type !== "toolCall" || calls.has(block.id)) continue;
      calls.set(block.id, { name: block.name, arguments: block.arguments });
    }
  }
  return calls;
}

// ---------------------------------------------------------------------------
// State document
// ---------------------------------------------------------------------------

/** What the agent is trying to do, rebuilt from user prose and the plan. */
export interface DecisionGoal {
  /** Latest `UserMessage`, up to 1 500 chars. */
  readonly request: string;
  /** Up to two previous `UserMessage`s, oldest first, 500 chars each. */
  readonly previous: readonly string[];
  /** `Goal / Next Steps` extract of the latest compaction summary, if any. */
  readonly compaction?: string;
  /** Latest assistant prose or plan, up to 800 chars. */
  readonly assistantPlan?: string;
}

/** Deterministic digest of what the Cooling Window already preserves intact. */
export interface DecisionProtectedDigest {
  /** One deterministic sentence the judge and the criteria can quote. */
  readonly summary: string;
  /** Files read inside the protected tail, in order of appearance. */
  readonly files: readonly string[];
  /** Files edited or written inside the protected tail. */
  readonly mutatedFiles: readonly string[];
  /** Commands executed inside the protected tail. */
  readonly commands: readonly string[];
}

/** One Turn of the session as the judge sees it. */
export interface DecisionTimelineTurn {
  /** 1-based Turn number; 0 is any prelude before the first user message. */
  readonly turn: number;
  /** Up to 300 chars of assistant prose emitted in the Turn. */
  readonly digest: string;
  /** Mutations the Turn executed, as `edit <path>` / `write <path>`. */
  readonly mutations: readonly string[];
  /** Candidate ids whose result was produced in this Turn. */
  readonly candidates: readonly string[];
}

/** One Living Candidate as it appears in the state's timeline. */
export interface DecisionCandidateEntry {
  readonly id: string;
  readonly tool: string;
  /** Compact arguments, priority keys (`path`, `pattern`, `command`) first. */
  readonly args: string;
  readonly chars: number;
  readonly tokensEst: number;
  readonly isError: boolean;
  readonly editedLater: boolean;
  readonly sameCommandRanLater: boolean;
  readonly laterCommandSucceeded: boolean;
  /** `head(200) + " … " + tail(200)` of the result text. */
  readonly preview: string;
}

/** The compact document posted as `state` to `/v1/systemone`. */
export interface DecisionStateDocument {
  readonly goal: DecisionGoal;
  readonly recentProtectedDigest: DecisionProtectedDigest;
  readonly timeline: {
    readonly turns: readonly DecisionTimelineTurn[];
    readonly candidates: readonly DecisionCandidateEntry[];
  };
}

/** Inputs of `buildDecisionState`: the masked messages and their partition. */
export interface DecisionStateInput {
  messages: readonly AgentMessage[];
  partition: CoolingWindowPartition;
  candidates: readonly DecisionCandidate[];
}

/** Builds the compact state document for the judge (spec D5 Phase 1.1). */
export function buildDecisionState(input: DecisionStateInput): DecisionStateDocument {
  const { messages, partition, candidates } = input;
  return {
    goal: buildGoal(messages),
    recentProtectedDigest: buildProtectedDigest(messages, partition),
    timeline: {
      turns: buildTurnDigests(messages, candidates),
      candidates: candidates.map(candidateEntry),
    },
  };
}

/** Estimated tokens of a state document, using the spec's chars / 4 rule. */
export function estimateDecisionStateTokens(state: DecisionStateDocument): number {
  return Math.ceil(JSON.stringify(state).length / 4);
}

/** Short anchor the question criteria quote for the currently active goal. */
export interface DecisionQuestionAnchor {
  readonly goal: string;
  readonly digest: string;
}

/** Derives the criteria anchor from a (budget-fitted) state document. */
export function decisionAnchor(state: DecisionStateDocument): DecisionQuestionAnchor {
  return {
    goal: clip(state.goal.request, ANCHOR_GOAL_CHARS),
    digest: clip(state.recentProtectedDigest.summary, ANCHOR_DIGEST_CHARS),
  };
}

// ---------------------------------------------------------------------------
// Budget reduction
// ---------------------------------------------------------------------------

/** Reduction steps `fitDecisionStateToBudget` applies, in order. */
export type DecisionStateReduction =
  | "turn_digest"
  | "turn_digest_with_candidates"
  | "goal_previous"
  | "goal_context"
  | "candidate_args_essential"
  | "candidate_preview_head"
  | "candidate_args_truncated"
  | "candidate_preview_short"
  | "candidate_excluded";

/** Result of fitting a state document to the `maxDecisionStateTokens` budget. */
export interface DecisionStateBudget {
  readonly state: DecisionStateDocument;
  /** Reduction steps that actually ran, in the order they ran. */
  readonly reductions: readonly DecisionStateReduction[];
  /**
   * Candidates removed from the state because the document could not fit the
   * budget even after every compression step. They stay `keep` for a future
   * Epoch, exactly like the batching leftovers.
   */
  readonly excludedCandidateIds: readonly string[];
}

/**
 * Fits a state document to the `maxDecisionStateTokens` budget (spec D5 Phase
 * 1.1): old Turn prose is compressed first and the candidates' `args` and
 * `preview` are the last fields to shrink. If even the fully compressed
 * document does not fit, the smallest and newest candidates are excluded from
 * the state so they stay `keep` instead of blowing the request budget.
 */
export function fitDecisionStateToBudget(
  state: DecisionStateDocument,
  maxTokens: number,
): DecisionStateBudget {
  const budget = Math.max(0, maxTokens);
  let current = cloneState(state);
  const reductions: DecisionStateReduction[] = [];
  const excludedCandidateIds: string[] = [];
  const overBudget = () => estimateDecisionStateTokens(current) > budget;
  const record = (step: DecisionStateReduction) => {
    if (!reductions.includes(step)) reductions.push(step);
  };
  const setTurns = (turns: readonly DecisionTimelineTurn[]) => {
    current = { ...current, timeline: { ...current.timeline, turns } };
  };
  const setCandidates = (candidates: readonly DecisionCandidateEntry[]) => {
    current = { ...current, timeline: { ...current.timeline, candidates } };
  };

  if (overBudget()) {
    // 1. Old Turn digests of turns WITHOUT candidates, oldest first.
    const turns = [...current.timeline.turns];
    for (let i = 0; i < turns.length && overBudget(); i++) {
      if (turns[i].candidates.length > 0 || turns[i].digest.length === 0) continue;
      turns[i] = { ...turns[i], digest: "" };
      setTurns(turns);
      record("turn_digest");
    }
    // 2. Remaining Turn digests, oldest first, shortened to 120 chars.
    for (let i = 0; i < turns.length && overBudget(); i++) {
      const digest = turns[i].digest;
      if (digest.length <= COMPRESSED_TURN_DIGEST_CHARS) continue;
      turns[i] = { ...turns[i], digest: clip(digest, COMPRESSED_TURN_DIGEST_CHARS) };
      setTurns(turns);
      record("turn_digest_with_candidates");
    }
    // 3. Goal prose: previous user messages, oldest first.
    while (overBudget() && current.goal.previous.length > 0) {
      const previous = current.goal.previous;
      current = {
        ...current,
        goal: {
          ...current.goal,
          previous: previous.length === 1 ? [] : previous.slice(1),
        },
      };
      record("goal_previous");
    }
    // 4. Goal context: compaction extract, then the assistant plan.
    if (overBudget() && (current.goal.compaction ?? "").length > COMPRESSED_TURN_DIGEST_CHARS) {
      current = { ...current, goal: { ...current.goal, compaction: clip(current.goal.compaction ?? "", COMPRESSED_TURN_DIGEST_CHARS) } };
      record("goal_context");
    }
    if (overBudget() && (current.goal.assistantPlan ?? "").length > COMPRESSED_TURN_DIGEST_CHARS) {
      current = { ...current, goal: { ...current.goal, assistantPlan: clip(current.goal.assistantPlan ?? "", COMPRESSED_TURN_DIGEST_CHARS) } };
      record("goal_context");
    }
    // 5. Candidate args keep only the essential keys, one candidate at a time.
    for (const candidate of [...current.timeline.candidates]) {
      if (!overBudget()) break;
      if (candidate.args.length <= ESSENTIAL_ARG_MAX_CHARS) continue;
      setCandidates(
        current.timeline.candidates.map((entry) =>
          entry.id === candidate.id
            ? { ...entry, args: clip(entry.args, ESSENTIAL_ARG_MAX_CHARS) }
            : entry,
        ),
      );
      record("candidate_args_essential");
    }
    // 6. Candidate previews lose the tail.
    for (const candidate of [...current.timeline.candidates]) {
      if (!overBudget()) break;
      const head = clip(candidate.preview, PREVIEW_HEAD_CHARS);
      if (head === candidate.preview) continue;
      setCandidates(
        current.timeline.candidates.map((entry) =>
          entry.id === candidate.id ? { ...entry, preview: head } : entry,
        ),
      );
      record("candidate_preview_head");
    }
    // 7. Candidate args hard-truncated.
    for (const candidate of [...current.timeline.candidates]) {
      if (!overBudget()) break;
      if (candidate.args.length <= 80) continue;
      setCandidates(
        current.timeline.candidates.map((entry) =>
          entry.id === candidate.id ? { ...entry, args: clip(entry.args, 80) } : entry,
        ),
      );
      record("candidate_args_truncated");
    }
    // 8. Candidate previews hard-truncated.
    for (const candidate of [...current.timeline.candidates]) {
      if (!overBudget()) break;
      if (candidate.preview.length <= 120) continue;
      setCandidates(
        current.timeline.candidates.map((entry) =>
          entry.id === candidate.id ? { ...entry, preview: clip(entry.preview, 120) } : entry,
        ),
      );
      record("candidate_preview_short");
    }
    // 9. Still over budget: exclude the smallest and newest candidates.
    while (overBudget() && current.timeline.candidates.length > 0) {
      const remaining = current.timeline.candidates;
      const weakest = [...remaining].sort(
        (a, b) => a.tokensEst - b.tokensEst || b.id.localeCompare(a.id, "en", { numeric: true }),
      )[0];
      excludedCandidateIds.push(weakest.id);
      setCandidates(remaining.filter((entry) => entry.id !== weakest.id));
      record("candidate_excluded");
    }
  }

  return { state: current, reductions, excludedCandidateIds };
}

// ---------------------------------------------------------------------------
// `noul` questions
// ---------------------------------------------------------------------------

/** Question kinds a policy can ask about one candidate. */
export type DecisionQuestionKind = "call" | "result";

/** A single `noul` question: probability that its predicate (keep) holds. */
export interface DecisionQuestion {
  readonly type: "noul";
  readonly instructions: string;
  readonly criteria: { readonly true: string; readonly false: string };
}

/** Name of one question: `result_c1`, `call_c1`. */
export function questionName(kind: DecisionQuestionKind, candidateId: string): string {
  return `${kind}_${candidateId}`;
}

/**
 * Builds the `noul` questions for one candidate (spec D5 Phase 1.2):
 * successful exploratory calls get two questions (`call_*`, `result_*`),
 * `bash` and bulky eligible errors get a single `result_*`, and anything the
 * per-tool policy cannot drop gets none.
 *
 * `true` always means "keep": a missing answer defaults to `1.0`, so an
 * unanswered question can never cause a drop.
 */
export function buildCandidateQuestions(
  candidate: DecisionCandidate,
  anchor: DecisionQuestionAnchor,
): Record<string, DecisionQuestion> {
  const policy = toolPolicyFor(candidate.toolName);
  const target = toolTarget(candidate);
  const hints = signalHints(candidate);
  const goal = clip(anchor.goal, ANCHOR_GOAL_CHARS);
  const digest = clip(anchor.digest, ANCHOR_DIGEST_CHARS);
  const output = candidate.isError ? "error output" : "output";

  const result: DecisionQuestion = {
    type: "noul",
    instructions: `Probability that the full ${candidate.toolName} ${output}${target} is still needed to continue the task.`,
    criteria: {
      true: `Keep the result: the ${output} is still needed for "${goal}" and is not fully covered by the preserved recent context (${digest}).`,
      false: `Drop the result body: the ${output} is obsolete for "${goal}"${hints}.`,
    },
  };

  if (policy.category === "exploratory" && !candidate.isError) {
    const call: DecisionQuestion = {
      type: "noul",
      instructions: `Probability that the agent still needs to see that this ${candidate.toolName} call${target} was made.`,
      criteria: {
        true: `Keep the call: knowing this ${candidate.toolName} call happened is still part of the trace for "${goal}".`,
        false: `Drop the call and its result: the trace of this ${candidate.toolName} call is no longer needed for "${goal}"${hints}.`,
      },
    };
    return {
      [questionName("call", candidate.id)]: call,
      [questionName("result", candidate.id)]: result,
    };
  }

  if (candidate.eligibility.dropResult || candidate.eligibility.dropCall) {
    return { [questionName("result", candidate.id)]: result };
  }
  return {};
}

/** One request's questions plus the mapping back to their candidates. */
export interface DecisionBatch {
  readonly index: number;
  readonly candidateIds: readonly string[];
  readonly questions: Readonly<Record<string, DecisionQuestion>>;
  /** Question name -> candidate id, so answer batches can be merged safely. */
  readonly owners: Readonly<Record<string, string>>;
  /** Estimated tokens of this batch's questions (chars / 4). */
  readonly questionTokens: number;
}

/** Outcome of packing the candidate pool into `/v1/systemone` requests. */
export interface DecisionBatchPlan {
  readonly batches: readonly DecisionBatch[];
  /** Candidates that did not fit; they stay `keep` for a future Epoch. */
  readonly leftovers: readonly DecisionCandidate[];
}

/** Options of `planDecisionBatches`. */
export interface DecisionBatchOptions {
  /** Tokens the state document already costs in every request. */
  stateTokens: number;
  config?: ToolPruningConfig;
}

/**
 * Packs the candidate pool into at most `maxDecisionBatches` requests (spec D5
 * Phase 1.2). Candidates are prioritised by size then age — the Pareto law says
 * the largest and oldest calls concentrate the reclaimable volume — and each
 * request respects both `maxQuestionsPerBatch` and the
 * `MAX_DECISION_REQUEST_TOKENS` ceiling shared with the state. Anything that
 * does not fit stays `keep` for a later Epoch instead of being silently
 * dropped.
 */
export function planDecisionBatches(
  candidates: readonly DecisionCandidate[],
  anchor: DecisionQuestionAnchor,
  options: DecisionBatchOptions,
): DecisionBatchPlan {
  const config = options.config ?? DEFAULT_TOOL_PRUNING_CONFIG;
  const maxBatches = Math.max(0, Math.trunc(config.maxDecisionBatches));
  const maxQuestions = Math.max(0, Math.trunc(config.maxQuestionsPerBatch));
  // Every request carries the same state; questions get what the 28k ceiling
  // leaves after it.
  const availableTokens = Math.max(0, MAX_DECISION_REQUEST_TOKENS - Math.max(0, options.stateTokens));

  if (candidates.length === 0 || maxBatches === 0 || maxQuestions === 0 || availableTokens === 0) {
    return { batches: [], leftovers: [...candidates] };
  }

  const priority = [...candidates].sort(
    (a, b) => b.tokensEst - a.tokensEst || a.resultIndex - b.resultIndex,
  );

  interface MutableBatch {
    index: number;
    candidateIds: string[];
    questions: Record<string, DecisionQuestion>;
    owners: Record<string, string>;
    questionTokens: number;
  }
  const batches: MutableBatch[] = [];

  for (const candidate of priority) {
    const questions = buildCandidateQuestions(candidate, anchor);
    const count = Object.keys(questions).length;
    if (count === 0) continue;
    const questionTokens = Math.ceil(JSON.stringify(questions).length / 4);

    const target = batches.find(
      (batch) =>
        Object.keys(batch.questions).length + count <= maxQuestions &&
        batch.questionTokens + questionTokens <= availableTokens &&
        !batch.candidateIds.includes(candidate.id),
    );
    if (target !== undefined) {
      target.candidateIds.push(candidate.id);
      Object.assign(target.questions, questions);
      Object.assign(target.owners, ownersOf(questions, candidate.id));
      target.questionTokens += questionTokens;
      continue;
    }
    // A fresh request must also respect the shared state + questions ceiling.
    if (batches.length >= maxBatches || questionTokens > availableTokens) continue;
    batches.push({
      index: batches.length,
      candidateIds: [candidate.id],
      questions: { ...questions },
      owners: ownersOf(questions, candidate.id),
      questionTokens,
    });
  }

  const batched = new Set(batches.flatMap((batch) => batch.candidateIds));
  return {
    batches: batches.map((batch) => ({
      index: batch.index,
      candidateIds: [...batch.candidateIds],
      questions: batch.questions,
      owners: batch.owners,
      questionTokens: batch.questionTokens,
    })),
    leftovers: candidates.filter((candidate) => !batched.has(candidate.id)),
  };
}

/** Maps every question name of one candidate back to the candidate id. */
function ownersOf(
  questions: Readonly<Record<string, unknown>>,
  candidateId: string,
): Record<string, string> {
  return Object.fromEntries(Object.keys(questions).map((name) => [name, candidateId]));
}

// ---------------------------------------------------------------------------
// Plan composition
// ---------------------------------------------------------------------------

/** Inputs of `buildDecisionPlan`. */
export interface DecisionPlanInput {
  messages: readonly AgentMessage[];
  partition: CoolingWindowPartition;
  /** Phase 0 structural signals keyed by `toolCallId`. */
  signals?: Readonly<Record<string, Partial<Phase0Signals>>>;
  config?: ToolPruningConfig;
}

/** Everything one Phase 1 decision round needs. */
export interface DecisionPlan {
  /** Every Living Candidate, in chronology order. */
  readonly candidates: readonly DecisionCandidate[];
  /** Budget-fitted state, limited to the candidates actually asked about. */
  readonly state: DecisionStateDocument;
  readonly stateTokens: number;
  readonly batches: readonly DecisionBatch[];
  /** Budget exclusions plus batching leftovers: all stay `keep`. */
  readonly leftovers: readonly DecisionCandidate[];
}

/**
 * Builds the whole Phase 1 plan: candidates, budget-fitted state, and the
 * batches that fit the request and batch caps.
 *
 * The batching limits are computed against the fitted state so `state +
 * questions` never exceeds the Gateway's 28k ceiling; the state is then
 * narrowed to the batched candidates so leftovers are not sent needlessly.
 */
export function buildDecisionPlan(input: DecisionPlanInput): DecisionPlan {
  const config = input.config ?? DEFAULT_TOOL_PRUNING_CONFIG;
  const candidates = collectDecisionCandidates(input.messages, input.partition, input.signals);
  const fullState = buildDecisionState({
    messages: input.messages,
    partition: input.partition,
    candidates,
  });
  const budget = fitDecisionStateToBudget(fullState, config.maxDecisionStateTokens);
  const excluded = new Set(budget.excludedCandidateIds);
  const eligible = candidates.filter((candidate) => !excluded.has(candidate.id));

  const anchor = decisionAnchor(budget.state);
  const fittedTokens = estimateDecisionStateTokens(budget.state);
  const batchPlan = planDecisionBatches(eligible, anchor, {
    stateTokens: fittedTokens,
    config,
  });

  const batched = new Set(batchPlan.batches.flatMap((batch) => batch.candidateIds));
  const askedState: DecisionStateDocument = {
    ...budget.state,
    timeline: {
      turns: budget.state.timeline.turns.map((turn) => ({
        ...turn,
        candidates: turn.candidates.filter((id) => batched.has(id)),
      })),
      candidates: budget.state.timeline.candidates.filter((entry) => batched.has(entry.id)),
    },
  };
  const leftovers = [
    ...candidates.filter((candidate) => excluded.has(candidate.id)),
    ...batchPlan.leftovers,
  ];

  return {
    candidates,
    state: askedState,
    stateTokens: estimateDecisionStateTokens(askedState),
    batches: batchPlan.batches,
    leftovers,
  };
}

// ---------------------------------------------------------------------------
// Two-band policy
// ---------------------------------------------------------------------------

/** Which watermark armed the Epoch, which decides the drop band. */
export type DecisionPolicyMode = "normal" | "emergency";

/** Inputs of `applyDecisionPolicy`. */
export interface DecisionPolicyOptions {
  mode: DecisionPolicyMode;
  /** Tokens of the masked context before the Epoch. */
  activeTokens: number;
  /** Context window of the resolved model. */
  contextWindow: number;
  config?: ToolPruningConfig;
}

/** Rules applied given the answers of the judge. */
export interface DecisionPolicyResult {
  /** Terminal drops keyed by `toolCallId`; `keep` is never persisted. */
  readonly decisions: Record<string, ToolPruningDrop>;
  /** Candidates the policy keeps in the Living Pool. */
  readonly kept: readonly string[];
  /** Candidates dropped by the high-confidence band (`< 0.25`). */
  readonly highConfidenceDrops: readonly string[];
  /** Candidates the emergency valve dropped from the uncertain band. */
  readonly emergencyDrops: readonly string[];
  /** Estimated context tokens after applying the decisions. */
  readonly projectedTokens: number;
}

/**
 * Applies the asymmetric two-band policy (spec D5 Phase 1.3).
 *
 * Normal mode: `keepResult >= 0.25` keeps the candidate, so the whole
 * uncertain band `[0.25, 0.50)` survives and avoids regret. Below `0.25` the
 * call is dropped only when the tool allows it AND `keepCall < 0.15`;
 * otherwise the result body is stubbed if the policy allows it.
 *
 * Emergency mode first applies the same high-confidence drops, and then — only
 * when the context is still above `60 %` — extends `drop_result` (never
 * `drop_call`) over the uncertain `[0.25, 0.40)` band ordered by
 * `keepResult / log2(tokensEst)` until the context reaches
 * `emergencyTargetRatio` or the band is exhausted.
 *
 * Missing or invalid answers are probability `1.0`: an unanswered question can
 * never cause a drop.
 */
export function applyDecisionPolicy(
  candidates: readonly DecisionCandidate[],
  answers: Readonly<Record<string, number>>,
  options: DecisionPolicyOptions,
): DecisionPolicyResult {
  const config = options.config ?? DEFAULT_TOOL_PRUNING_CONFIG;
  const decisions: Record<string, ToolPruningDrop> = {};
  const highConfidenceDrops: string[] = [];
  let projectedTokens = Math.max(0, options.activeTokens);

  const evaluated = candidates.map((candidate) => ({
    candidate,
    keepResult: probability(answers, questionName("result", candidate.id)),
    keepCall: probability(answers, questionName("call", candidate.id)),
  }));

  for (const item of evaluated) {
    const { candidate } = item;
    if (item.keepResult >= config.dropResultThreshold) continue;

    if (candidate.eligibility.dropCall && item.keepCall < config.dropCallThreshold) {
      decisions[candidate.toolCallId] = "drop_call";
      highConfidenceDrops.push(candidate.toolCallId);
      projectedTokens = Math.max(0, projectedTokens - candidate.tokensEst);
      continue;
    }
    if (candidate.eligibility.dropResult) {
      decisions[candidate.toolCallId] = "drop_result";
      highConfidenceDrops.push(candidate.toolCallId);
      projectedTokens = Math.max(0, projectedTokens - candidate.resultTokens);
    }
  }

  const emergencyDrops: string[] = [];
  const extendTrigger = EMERGENCY_EXTEND_TRIGGER_RATIO * Math.max(0, options.contextWindow);
  if (
    options.mode === "emergency" &&
    options.contextWindow > 0 &&
    projectedTokens > extendTrigger
  ) {
    const target = config.emergencyTargetRatio * options.contextWindow;
    const band = evaluated
      .filter(
        (item) =>
          decisions[item.candidate.toolCallId] === undefined &&
          item.candidate.eligibility.dropResult &&
          item.keepResult >= config.dropResultThreshold &&
          item.keepResult < config.emergencyUpperBand,
      )
      .sort(
        (a, b) =>
          emergencyRank(a) - emergencyRank(b) ||
          a.candidate.resultIndex - b.candidate.resultIndex,
      );

    for (const item of band) {
      if (projectedTokens <= target) break;
      decisions[item.candidate.toolCallId] = "drop_result";
      emergencyDrops.push(item.candidate.toolCallId);
      projectedTokens = Math.max(0, projectedTokens - item.candidate.resultTokens);
    }
  }

  const kept = evaluated
    .filter((item) => decisions[item.candidate.toolCallId] === undefined)
    .map((item) => item.candidate.toolCallId);

  return {
    decisions,
    kept,
    highConfidenceDrops,
    emergencyDrops,
    projectedTokens,
  };
}

/**
 * Emergency ordering key: least needed per reclaimed token first. A lower
 * `keepResult` and a larger `tokensEst` both lower the score.
 */
function emergencyRank(item: { candidate: DecisionCandidate; keepResult: number }): number {
  const denominator = Math.log2(Math.max(2, item.candidate.tokensEst));
  return item.keepResult / denominator;
}

/** A `noul` answer, defaulting to `1.0` (keep) when missing or invalid. */
function probability(answers: Readonly<Record<string, number>>, name: string): number {
  const value = answers[name];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) return 1;
  return value;
}

// ---------------------------------------------------------------------------
// State construction helpers
// ---------------------------------------------------------------------------

/** Goal section: latest request, two previous messages and the plan. */
function buildGoal(messages: readonly AgentMessage[]): DecisionGoal {
  const userTexts = messages
    .filter((message): message is Extract<AgentMessage, { role: "user" }> => message.role === "user")
    .map(userMessageText)
    .filter((text) => text.trim().length > 0);

  const request = clip(userTexts.at(-1) ?? "", GOAL_MAIN_MAX_CHARS);
  const previousStart = Math.max(0, userTexts.length - 1 - GOAL_PREVIOUS_MESSAGES);
  const previous = userTexts
    .slice(previousStart, Math.max(0, userTexts.length - 1))
    .map((text) => clip(text, GOAL_PREVIOUS_MAX_CHARS));

  const goal: { request: string; previous: string[]; compaction?: string; assistantPlan?: string } = {
    request,
    previous,
  };

  const compaction = lastCompactionExtract(messages);
  if (compaction !== undefined) goal.compaction = compaction;
  const assistantPlan = lastAssistantPlan(messages);
  if (assistantPlan !== undefined) goal.assistantPlan = assistantPlan;
  return goal;
}

/** Text of a `UserMessage`, which is either a string or text/image blocks. */
function userMessageText(message: Extract<AgentMessage, { role: "user" }>): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

/**
 * `Goal / Next Steps` extract of the latest `CompactionSummaryMessage`. When
 * the summary has no such headings, the whole summary is clipped instead.
 */
function lastCompactionExtract(messages: readonly AgentMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "compactionSummary") continue;
    return clip(extractGoalSection(message.summary), GOAL_CONTEXT_MAX_CHARS);
  }
  return undefined;
}

/** Lines under `Goal` / `Next Steps` headings, or the whole summary. */
function extractGoalSection(summary: string): string {
  const picked: string[] = [];
  let inSection = false;
  for (const line of summary.split("\n")) {
    const heading =
      /^\s{0,3}#{1,6}\s+(.*)$/.exec(line)?.[1] ?? /^\s*\*\*(.+?)\*\*\s*$/.exec(line)?.[1];
    if (heading !== undefined) {
      inSection = /goal|next steps/i.test(heading);
      if (inSection) picked.push(line.trim());
      continue;
    }
    if (!inSection) continue;
    if (line.trim().length > 0) picked.push(line.trim());
    if (picked.length >= 12) break;
  }
  return picked.length > 0 ? picked.join("\n") : summary;
}

/** Latest assistant prose or plan, which tells the judge the current intent. */
function lastAssistantPlan(messages: readonly AgentMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    const text = message.content
      .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
      .map((block) => block.text)
      .filter((value) => value.trim().length > 0)
      .join("\n");
    if (text.length > 0) return clip(text, GOAL_CONTEXT_MAX_CHARS);
  }
  return undefined;
}

/** Digest of the protected tail: recent reads, mutations and commands. */
function buildProtectedDigest(
  messages: readonly AgentMessage[],
  partition: CoolingWindowPartition,
): DecisionProtectedDigest {
  const files: string[] = [];
  const mutatedFiles: string[] = [];
  const commands: string[] = [];
  const seenFiles = new Set<string>();
  const seenMutations = new Set<string>();
  const seenCommands = new Set<string>();
  const calls = indexToolCalls(messages);

  for (let i = Math.max(0, partition.protectedStartIndex); i < messages.length; i++) {
    const message = messages[i];
    if (message.role === "bashExecution") {
      const command = message.command;
      if (command.length > 0 && !seenCommands.has(command)) {
        seenCommands.add(command);
        commands.push(clip(command, 120));
      }
      continue;
    }
    if (message.role !== "toolResult") continue;
    const toolCall = calls.get(message.toolCallId);
    if (toolCall === undefined) continue;
    const path = stringArgument(toolCall.arguments, "path");
    if (toolPolicyFor(toolCall.name).category === "exploratory" && path !== undefined) {
      if (!seenFiles.has(path)) {
        seenFiles.add(path);
        files.push(path);
      }
    }
    if (toolCall.name === "edit" || toolCall.name === "write") {
      if (path !== undefined && !seenMutations.has(path)) {
        seenMutations.add(path);
        mutatedFiles.push(path);
      }
    }
    if (toolCall.name === "bash") {
      const command = stringArgument(toolCall.arguments, "command");
      if (command !== undefined && !seenCommands.has(command)) {
        seenCommands.add(command);
        commands.push(clip(command, 120));
      }
    }
  }

  const summary = clip(
    `Preserved intact in the recent window: read ${listOrNone(files)}; ` +
      `edited ${listOrNone(mutatedFiles)}; ran ${listOrNone(commands)}.`,
    400,
  );
  return { summary, files, mutatedFiles, commands };
}

/** Per-Turn prose digest, mutations and candidate ids (spec D5 Phase 1.1). */
function buildTurnDigests(
  messages: readonly AgentMessage[],
  candidates: readonly DecisionCandidate[],
): DecisionTimelineTurn[] {
  interface Bucket {
    turn: number;
    prose: string[];
    mutations: string[];
    candidates: string[];
  }
  const buckets: Bucket[] = [];
  const candidateIdsByIndex = new Map<number, string[]>();
  for (const candidate of candidates) {
    const ids = candidateIdsByIndex.get(candidate.resultIndex) ?? [];
    ids.push(candidate.id);
    candidateIdsByIndex.set(candidate.resultIndex, ids);
  }

  let turn = 0;
  let current: Bucket | undefined;
  const bucketFor = (): Bucket => {
    if (current === undefined) {
      current = { turn, prose: [], mutations: [], candidates: [] };
      buckets.push(current);
    }
    return current;
  };

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (message.role === "user") {
      turn += 1;
      current = undefined;
    }
    if (message.role === "assistant") {
      for (const block of message.content) {
        if (block.type === "text" && block.text.trim().length > 0) {
          bucketFor().prose.push(block.text.trim());
          continue;
        }
        if (block.type !== "toolCall") continue;
        if (block.name !== "edit" && block.name !== "write") continue;
        const path = stringArgument(block.arguments, "path");
        if (path !== undefined) bucketFor().mutations.push(`${block.name} ${path}`);
      }
    }
    const ids = candidateIdsByIndex.get(i);
    if (ids !== undefined) bucketFor().candidates.push(...ids);
  }

  return buckets
    .filter((bucket) => bucket.prose.length > 0 || bucket.mutations.length > 0 || bucket.candidates.length > 0)
    .map((bucket) => ({
      turn: bucket.turn,
      digest: clip(bucket.prose.join(" "), TURN_DIGEST_MAX_CHARS),
      mutations: bucket.mutations,
      candidates: bucket.candidates,
    }));
}

/** One candidate's entry in the state's timeline. */
function candidateEntry(candidate: DecisionCandidate): DecisionCandidateEntry {
  return {
    id: candidate.id,
    tool: candidate.toolName,
    args: formatToolArguments(candidate.arguments, QUESTION_ARG_MAX_CHARS),
    chars: candidate.chars,
    tokensEst: candidate.tokensEst,
    isError: candidate.isError,
    editedLater: candidate.signals.editedLater,
    sameCommandRanLater: candidate.signals.sameCommandRanLater,
    laterCommandSucceeded: candidate.signals.laterCommandSucceeded,
    preview: previewOf(candidate.resultText),
  };
}

/**
 * Compact tool arguments, priority keys first (`path`, `file_path`, `pattern`,
 * `command`, `glob`, `offset`, `limit`) so a truncated string still carries
 * what identifies the call.
 */
export function formatToolArguments(
  args: Readonly<Record<string, unknown>>,
  maxChars: number = QUESTION_ARG_MAX_CHARS,
): string {
  const ordered: Record<string, unknown> = {};
  for (const key of ARGUMENT_KEY_ORDER) {
    if (args[key] !== undefined) ordered[key] = args[key];
  }
  for (const [key, value] of Object.entries(args)) {
    if (ordered[key] === undefined) ordered[key] = value;
  }
  return clip(JSON.stringify(ordered), maxChars);
}

/** Priority order of tool argument keys, most identifying first. */
const ARGUMENT_KEY_ORDER = [
  "path",
  "file_path",
  "pattern",
  "command",
  "glob",
  "offset",
  "limit",
] as const;

/** `head(200) + " … " + tail(200)` of a result text. */
function previewOf(text: string): string {
  const headChars = Math.max(0, PREVIEW_HEAD_CHARS);
  const tailChars = Math.max(0, PREVIEW_TAIL_CHARS);
  if (text.length <= headChars + tailChars + 3) return text;
  const head = text.slice(0, headChars);
  const tail = tailChars === 0 ? "" : text.slice(text.length - tailChars);
  return tail.length === 0 ? head : `${head} … ${tail}`;
}

/** Short human description of the call target used in the criteria. */
function toolTarget(candidate: DecisionCandidate): string {
  const path = stringArgument(candidate.arguments, "path");
  const pattern = stringArgument(candidate.arguments, "pattern");
  const command = stringArgument(candidate.arguments, "command");
  const target = path ?? pattern ?? command;
  return target === undefined ? "" : ` on ${clip(target, 80)}`;
}

/** Phase 0 hints appended to the `false` (drop) criteria. */
function signalHints(candidate: DecisionCandidate): string {
  const hints: string[] = [];
  if (candidate.signals.editedLater) hints.push("the file was modified afterwards");
  if (candidate.signals.sameCommandRanLater) {
    hints.push(
      candidate.signals.laterCommandSucceeded
        ? "the same command ran again and succeeded afterwards"
        : "the same command ran again afterwards",
    );
  }
  return hints.length === 0 ? "" : ` (${hints.join("; ")})`;
}

/** String argument of a tool call, when present. */
function stringArgument(args: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** `a, b, c` or `nothing`. */
function listOrNone(values: readonly string[]): string {
  return values.length === 0 ? "nothing" : values.join(", ");
}

/** Shortens a value to `maxChars`, marking the cut with an ellipsis. */
function clip(value: string, maxChars: number): string {
  const limit = Math.max(0, Math.trunc(maxChars));
  if (value.length <= limit) return value;
  if (limit === 0) return "";
  return `${value.slice(0, limit - 1)}…`;
}

/** Deep-enough copy of a state document so reduction never mutates its input. */
function cloneState(state: DecisionStateDocument): DecisionStateDocument {
  return {
    goal: { ...state.goal, previous: [...state.goal.previous] },
    recentProtectedDigest: { ...state.recentProtectedDigest },
    timeline: {
      turns: state.timeline.turns.map((turn) => ({
        ...turn,
        mutations: [...turn.mutations],
        candidates: [...turn.candidates],
      })),
      candidates: state.timeline.candidates.map((candidate) => ({ ...candidate })),
    },
  };
}
