/**
 * Orchestrator of the pruning Epochs (spec D3, D5 trigger logic, D6 fail-open,
 * D7 persistence).
 *
 * An Epoch is the only moment Tool Pruning touches the network and the only
 * moment it invalidates the provider's cached prefix, so this module owns
 * three responsibilities and nothing else:
 *
 * 1. **Cadence (D3).** Watermarks are checked against the masked projection on
 *    every `context` call, but a turn-start Epoch is only *checked* on the
 *    first call of a Turn (armed by `begin_agent_start`), so the intermediate
 *    steps of a normal Turn never break the KV-cache. The intra-Turn emergency
 *    watermark is the safety valve for marathon Turns and subagents. A
 *    low-yield or failed-open Epoch installs a cooldown measured in prunable
 *    tokens, so a degraded judge cannot turn into a retry storm.
 * 2. **Decision (D5).** Phase 0 (`runSupersession`) runs first and for free;
 *    Phase 1 (the calibrated `noul` judge) only runs when what Phase 0 left is
 *    worth a round-trip. Batches go out concurrently (at most
 *    `maxDecisionBatches`) and the merged answers feed `applyDecisionPolicy`,
 *    which owns the single conservative drop band.
 * 3. **Persistence (D7).** An Epoch that dropped anything appends a
 *    `ToolPruningEpochEntry` (carrying the `watermark` step it consumed) to the
 *    session tree, and the active mask map is rebuilt from `getBranch()` so a
 *    Message Edit that abandons a branch also abandons the masks decided on it.
 *
 * TODO(ticket 06): the cadence above is still the pre-05b two-arm design (a
 * soft/hard ratio pair plus a token cooldown, with the intra-Turn "emergency"
 * arm). Spec D3 replaces it with the monotonic watermark staircase
 * (`config.watermarks` + `highestConsumedWatermark` derived from the branch);
 * this refactor only maps the removed knobs onto their `watermarks` equivalents
 * so the tree keeps compiling and the existing behaviour keeps its tests.
 *
 * Everything here is pure TypeScript over the modules of tickets 02–05. The
 * runner never imports worker `src/` runtime modules, never reads global
 * config and never touches `process.env`: credentials, the model's context
 * window, the session branch, the entry sink and the trace sink all arrive as
 * ports, which is also what makes it testable without a live Pi session.
 */
import {
  calculateContextTokens,
  estimateTokens,
} from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_TOOL_PRUNING_CONFIG,
  TOOL_PRUNING_ENTRY_TYPE,
  type AgentMessage,
  type ToolPruningConfig,
  type ToolPruningConfigOverrides,
  type ToolPruningDrop,
  type ToolPruningEpochEntry,
  type ToolPruningEpochStats,
  type ToolPruningMaskMap,
} from "./config";
import {
  partitionCoolingWindow,
  type CoolingWindowPartition,
  type PruningCandidate,
} from "./cooling-window";
import {
  applyDecisionPolicy,
  buildDecisionPlan,
  type DecisionPlan,
  type DecisionPolicyResult,
  type Phase0Signals,
} from "./decision-state";
import { applyPruningMask } from "./mask";
import type { ToolPruningTraceLogger } from "./pruning-bridge";
import { isJudgeWorthwhile, runSupersession } from "./supersession";
import {
  requestSystemOneDecision,
  type SystemOneClientOptions,
  type SystemOneDecisionRequest,
  type SystemOneResult,
} from "./systemone-client";

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

/** Gateway credentials for `/v1/systemone`, resolved per Epoch. */
export interface ToolPruningCredentials {
  /** `ctx.model.baseUrl`, which already ends in `/v1`. */
  baseUrl: string;
  /** Bearer token from `getApiKeyAndHeaders`; absent when none is configured. */
  apiKey?: string;
  /** Extra headers `getApiKeyAndHeaders` returned, null values already dropped. */
  headers?: Readonly<Record<string, string>>;
}

/**
 * The part of a Pi session entry the runner reads. Declared structurally so
 * this module needs no session-manager types and stays importable by jiti.
 */
export interface ToolPruningSessionEntry {
  readonly type: string;
  readonly customType?: string;
  readonly data?: unknown;
}

/** What one projection pass produced. */
export interface ToolPruningProjection {
  /** The masked `AgentMessage[]` for the provider. */
  messages: AgentMessage[];
  /** Whether the projection differs from the input (identity comparison). */
  changed: boolean;
}

/** Everything the runner needs from its host (worker or test). */
export interface ToolPruningEpochRunnerOptions {
  /** Working directory Phase 0 resolves relative tool paths against (`ctx.cwd`). */
  cwd: string;
  /** Overrides merged over the spec defaults (bridge / `WorkerRuntimeConfig`). */
  config?: ToolPruningConfigOverrides;
  /** `ctx.model.contextWindow`, or `undefined` while no model is resolved. */
  getContextWindow?: () => number | undefined;
  /** Resolves credentials lazily, once per Epoch that reaches the judge. */
  getCredentials?: () => Promise<ToolPruningCredentials | undefined>;
  /** Persists the Epoch entry (`pi.appendEntry(TOOL_PRUNING_ENTRY_TYPE, entry)`). */
  appendEntry?: (customType: string, entry: ToolPruningEpochEntry) => void;
  /** Active branch of the session tree, for branch-aware mask reconstruction. */
  getBranch?: () => readonly ToolPruningSessionEntry[];
  /** Current leaf id (`ctx.sessionManager.getLeafId()`), memoises the rebuild. */
  getLeafId?: () => string | null;
  /** Real worker trace logger, resolved inside the tracing context at call time. */
  getTraceLogger?: () => ToolPruningTraceLogger | undefined;
  /** Turn abort signal (`ctx.signal`). */
  getSignal?: () => AbortSignal | undefined;
  /** Judge transport; `/v1/systemone` in production, stubbed by unit tests. */
  judge?: (
    request: SystemOneDecisionRequest,
    options: SystemOneClientOptions,
  ) => Promise<SystemOneResult>;
  /** Clock, injectable so `latencyMs` is deterministic in tests. */
  now?: () => number;
}

// ---------------------------------------------------------------------------
// Token accounting
// ---------------------------------------------------------------------------

/**
 * Active context tokens of a projection (spec D3): the provider's own count at
 * the last assistant usage plus an estimate of everything after it. A session
 * that has no valid usage yet (fresh, or straight after a Compaction) falls
 * back to estimating every message.
 */
export function estimateActiveTokens(messages: readonly AgentMessage[]): number {
  let usageIndex = -1;
  let usageTokens = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    const usage = message.usage;
    if (!usage) continue;
    const tokens = calculateContextTokens(usage);
    if (tokens <= 0) continue;
    usageIndex = i;
    usageTokens = tokens;
    break;
  }

  let trailingTokens = 0;
  if (usageIndex < 0) {
    for (const message of messages) trailingTokens += estimateTokens(message);
    return trailingTokens;
  }
  for (let i = usageIndex + 1; i < messages.length; i++) {
    trailingTokens += estimateTokens(messages[i]);
  }
  return usageTokens + trailingTokens;
}

// ---------------------------------------------------------------------------
// Legacy cadence (see the TODO(ticket 06) in the module doc comment)
// ---------------------------------------------------------------------------

/**
 * Which arm of the legacy cadence armed the Epoch.
 * TODO(ticket 06): the monotonic watermark staircase has no arms; it has a
 * consumed `watermark` step instead.
 */
type EpochArm = "turn_watermark" | "intra_turn_emergency";

/** Prunable tokens that arm a turn-start Epoch on a roomy window. */
const LEGACY_TURN_DELTA_PRUNE_TOKENS = 30_000;

/** Prunable growth required after a low-yield or fail-open Epoch. */
const LEGACY_EPOCH_COOLDOWN_TOKENS = 15_000;

/**
 * Context ratio bounds of the legacy cadence: the lowest watermark arms a
 * turn-start Epoch, the highest one arms the emergency valve.
 * TODO(ticket 06): replace with `nextWatermark`/`highestConsumedWatermark`.
 */
function watermarkBounds(watermarks: readonly number[]): { soft: number; hard: number } {
  let soft = Number.POSITIVE_INFINITY;
  let hard = Number.NEGATIVE_INFINITY;
  for (const watermark of watermarks) {
    if (watermark < soft) soft = watermark;
    if (watermark > hard) hard = watermark;
  }
  return { soft, hard };
}

/**
 * Watermark step an Epoch consumes: the highest configured step the masked
 * context already reached (spec D3), or `0` when the legacy delta arm fired
 * below every step.
 * TODO(ticket 06): the staircase owns this computation.
 */
function consumedWatermark(
  activeTokens: number,
  contextWindow: number,
  watermarks: readonly number[],
): number {
  let consumed = 0;
  for (const watermark of watermarks) {
    if (activeTokens >= watermark * contextWindow) consumed = watermark;
  }
  return consumed;
}

// ---------------------------------------------------------------------------
// Branch-aware mask reconstruction
// ---------------------------------------------------------------------------

/** Masks and epoch counter recovered from one session branch. */
export interface ToolPruningBranchState {
  /** Terminal drops persisted on the branch, keyed by `toolCallId`. */
  readonly masks: Record<string, ToolPruningDrop>;
  /** Highest `epochId` seen on the branch (`0` when none). */
  readonly lastEpochId: number;
}

/**
 * Rebuilds the active masks from a session branch (spec D7).
 *
 * Only `custom` entries of type `tool-pruning` participate, and only entries
 * on the *active* branch: an Epoch decided on a branch the user abandoned with
 * a Message Edit is simply not in `getBranch()`, so its masks disappear and
 * the tool results it had pruned come back for the model. Entries are applied
 * in branch order, so a later Epoch re-deciding the same call wins.
 */
export function masksFromBranch(
  entries: readonly ToolPruningSessionEntry[],
): ToolPruningBranchState {
  const masks: Record<string, ToolPruningDrop> = {};
  let lastEpochId = 0;
  for (const entry of entries) {
    const epoch = readEpochEntry(entry);
    if (epoch === undefined) continue;
    lastEpochId = Math.max(lastEpochId, epoch.epochId);
    for (const [toolCallId, decision] of Object.entries(epoch.decisions)) {
      masks[toolCallId] = decision;
    }
  }
  return { masks, lastEpochId };
}

/**
 * Reads one `tool-pruning` custom entry defensively: a newer or corrupted entry
 * must never break the projection, so anything that does not match the schema
 * is ignored instead of throwing inside `pi.on("context")`.
 */
function readEpochEntry(
  entry: ToolPruningSessionEntry,
): Pick<ToolPruningEpochEntry, "epochId" | "decisions"> | undefined {
  if (entry.type !== "custom" || entry.customType !== TOOL_PRUNING_ENTRY_TYPE) return undefined;
  const data = entry.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return undefined;
  const record = data as Record<string, unknown>;
  if (record.version !== 1) return undefined;
  if (typeof record.epochId !== "number" || !Number.isFinite(record.epochId)) return undefined;
  const rawDecisions = record.decisions;
  if (typeof rawDecisions !== "object" || rawDecisions === null || Array.isArray(rawDecisions)) {
    return undefined;
  }

  const decisions: Record<string, ToolPruningDrop> = {};
  for (const [toolCallId, decision] of Object.entries(rawDecisions)) {
    if (decision === "drop_result" || decision === "drop_call") decisions[toolCallId] = decision;
  }
  return { epochId: record.epochId, decisions };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/** Cooldown installed by a low-yield or failed-open Epoch (spec D3). */
interface PruningCooldown {
  /** Prunable tokens left when the Epoch finished; growth is measured from here. */
  readonly baselineTokens: number;
}

/** Inputs of one Epoch. */
interface EpochInput {
  /** Which legacy arm armed it; traces only, the policy is the same. */
  arm: EpochArm;
  /** Masked projection the Epoch measures and decides on. */
  messages: readonly AgentMessage[];
  activeTokens: number;
  partition: CoolingWindowPartition;
  contextWindow: number;
}

/**
 * Stateful orchestrator of one Pi session's pruning Epochs.
 *
 * The host (the Tool Pruning extension) forwards its hooks here:
 * `beginTurn()` on `before_agent_start` and `onContext(event.messages)` on
 * every `context` event. The runner keeps only per-session state — the active
 * masks, the leaf the masks were derived from, the Epoch counter and the
 * cooldown — so a relayed session can be rebuilt from the branch at any time.
 */
export class ToolPruningEpochRunner {
  readonly config: ToolPruningConfig;
  private readonly options: ToolPruningEpochRunnerOptions;
  private masks: Record<string, ToolPruningDrop> = {};
  private lastLeafId: string | null | undefined;
  private epochCounter = 0;
  private turnArmed = false;
  private turnContextCalls = 0;
  private cooldown: PruningCooldown | undefined;
  /** The cooldown's single emergency override has already been spent this Turn. */
  private emergencyOverrideSpent = false;

  constructor(options: ToolPruningEpochRunnerOptions) {
    this.options = options;
    this.config = { ...DEFAULT_TOOL_PRUNING_CONFIG, ...options.config };
  }

  /** Masks currently applied on the active branch (a snapshot copy). */
  get activeMasks(): ToolPruningMaskMap {
    return { ...this.masks };
  }

  /**
   * Arms the turn-start watermark (spec D3.1). Called from
   * `before_agent_start`, so only the first `context` call of a Turn can pay
   * the Epoch; every later call in the same Turn is limited to the emergency
   * valve.
   */
  beginTurn(): void {
    this.turnArmed = true;
    this.turnContextCalls = 0;
    this.emergencyOverrideSpent = false;
  }

  /**
   * Applies the persisted masks, then possibly runs an Epoch (spec D3 + D5).
   *
   * Always returns the projection the provider must receive: masks are applied
   * even when nothing triggers, and an Epoch's new decisions are folded into
   * the same returned projection so the Turn pays at most one prefix update.
   */
  async onContext(messages: readonly AgentMessage[]): Promise<ToolPruningProjection> {
    if (!this.config.enabled) return { messages: messages.slice(), changed: false };

    this.syncMasksFromBranch();
    const firstContextOfTurn = this.turnArmed && this.turnContextCalls === 0;
    this.turnContextCalls += 1;
    if (firstContextOfTurn) this.turnArmed = false;

    const masked = applyPruningMask(messages, this.masks, this.config);
    const contextWindow = this.options.getContextWindow?.();
    // No resolved model means no window to measure against: never trigger.
    if (contextWindow === undefined || contextWindow <= 0) {
      return { messages: masked, changed: differs(messages, masked) };
    }

    const arm: EpochArm = firstContextOfTurn ? "turn_watermark" : "intra_turn_emergency";
    const partition = partitionCoolingWindow(masked, {
      config: this.config,
      masks: this.masks,
    });
    const activeTokens = estimateActiveTokens(masked);
    const armed = this.chooseTrigger(arm, activeTokens, partition, contextWindow);
    if (armed === undefined) return { messages: masked, changed: differs(messages, masked) };

    await this.runEpoch({ arm: armed, messages: masked, activeTokens, partition, contextWindow });
    const projected = applyPruningMask(messages, this.masks, this.config);
    return { messages: projected, changed: differs(messages, projected) };
  }

  // -------------------------------------------------------------------------
  // Cadence
  // -------------------------------------------------------------------------

  /**
   * Decides whether this `context` call starts an Epoch (spec D3).
   *
   * Turn-start Epochs need the lowest watermark (or a large prunable pool)
   * **and** `minWorthwhilePruneTokens`; emergency Epochs need the highest
   * watermark and the same minimum pool. A cooldown blocks both until the pool
   * grew by `LEGACY_EPOCH_COOLDOWN_TOKENS`, except for the first crossing of
   * the emergency watermark in the Turn.
   * TODO(ticket 06): replace with the monotonic watermark staircase.
   */
  private chooseTrigger(
    arm: EpochArm,
    activeTokens: number,
    partition: CoolingWindowPartition,
    contextWindow: number,
  ): EpochArm | undefined {
    const config = this.config;
    if (config.watermarks.length === 0) return undefined;
    const prunableTokens = partition.candidateTokens;
    if (prunableTokens < config.minWorthwhilePruneTokens) return undefined;

    const { soft, hard } = watermarkBounds(config.watermarks);
    const emergency = activeTokens >= hard * contextWindow;
    if (arm === "turn_watermark") {
      const under = activeTokens >= soft * contextWindow;
      const delta = prunableTokens >= LEGACY_TURN_DELTA_PRUNE_TOKENS;
      if (!under && !delta) return undefined;
    } else if (!emergency) {
      return undefined;
    }

    if (this.cooldown !== undefined) {
      const grown =
        prunableTokens >= this.cooldown.baselineTokens + LEGACY_EPOCH_COOLDOWN_TOKENS;
      if (!grown) {
        if (!emergency || this.emergencyOverrideSpent) return undefined;
        // Safety valve: the very first crossing of the hard watermark lifts the
        // cooldown, so a turn cannot run into Pi's compaction ceiling because a
        // previous Epoch happened to be low-yield.
        this.emergencyOverrideSpent = true;
        this.trace()?.info("tool_pruning.cooldown_bypassed", {
          activeTokens,
          prunableTokens,
          contextWindow,
        });
      }
    }
    return arm;
  }

  // -------------------------------------------------------------------------
  // Epoch execution
  // -------------------------------------------------------------------------

  /** Runs Phase 0 → short-circuit → Phase 1 → persistence (spec D5 + D6 + D7). */
  private async runEpoch(input: EpochInput): Promise<void> {
    const { arm, messages, activeTokens, partition, contextWindow } = input;
    const startedAt = this.now();
    this.epochCounter += 1;
    const epochId = this.epochCounter;
    // Watermark step this Epoch consumes (spec D7); the staircase is ticket 06.
    const watermark = consumedWatermark(activeTokens, contextWindow, this.config.watermarks);

    // Phase 0: deterministic supersession, no network, no latency.
    const supersession = runSupersession(messages, partition.candidates, {
      cwd: this.options.cwd,
      config: this.config,
    });
    const activeAfterPhase0 = Math.max(0, activeTokens - supersession.droppedTokens);

    // Phase 1: only when Phase 0 left enough on the table (spec D5 Phase 0.3).
    const judgeRan = isJudgeWorthwhile({
      activeTokens: activeAfterPhase0,
      contextWindow,
      remainingCandidateTokens: supersession.remainingTokens,
      config: this.config,
    });
    const plan = judgeRan ? this.planDecision(messages, partition, supersession.remaining) : undefined;
    const decision = await this.askJudge(plan, activeAfterPhase0);
    if (decision === "aborted") {
      this.trace()?.info("tool_pruning.epoch_aborted", { epochId, arm, watermark });
      return;
    }

    const failedOpen = decision !== undefined && decision.failedOpen;
    let effective: Record<string, ToolPruningDrop> = {
      ...supersession.decisions,
      ...(decision?.decisions ?? {}),
    };
    if (failedOpen && supersession.droppedTokens < this.config.minJudgeWorthwhileTokens) {
      // Spec D6: a failed judge only persists Phase 0 drops when they are worth
      // a prefix update on their own; otherwise this attempt mutates nothing.
      effective = {};
    }

    const tokensSavedEst = this.estimateSavedTokens(effective, partition.candidates);
    const stats: ToolPruningEpochStats = {
      deterministicDrops: countDrops(effective, supersession.decisions),
      judgeDrops: countDrops(effective, decision?.decisions ?? {}),
      candidatesEvaluated: plan?.candidates.length ?? partition.candidates.length,
      batches: decision?.batches ?? 0,
      latencyMs: this.now() - startedAt,
      ...(decision?.decisionModel === undefined ? {} : { decisionModel: decision.decisionModel }),
      ...(decision?.cost === undefined ? {} : { cost: decision.cost }),
      ...(failedOpen ? { failedOpen: true } : {}),
    };

    const decisions = Object.keys(effective) as string[];
    if (decisions.length > 0) {
      const entry: ToolPruningEpochEntry = {
        version: 1,
        epochId,
        watermark,
        timestamp: startedAt,
        tokensBefore: activeTokens,
        tokensSavedEst,
        decisions: effective,
        stats,
      };
      this.masks = { ...this.masks, ...effective };
      // The appended entry changes the leaf: force the next projection to
      // rebuild from the branch instead of trusting the local mask map.
      this.lastLeafId = undefined;
      this.options.appendEntry?.(TOOL_PRUNING_ENTRY_TYPE, entry);
      this.trace()?.info("tool_pruning.epoch_completed", summarizeEpoch(entry, stats));
    } else {
      this.trace()?.info("tool_pruning.epoch_completed", {
        epochId,
        arm,
        watermark,
        tokensBefore: activeTokens,
        tokensSavedEst: 0,
        decisions: 0,
        ...stats,
      });
    }
    if (failedOpen) {
      this.trace()?.warn("tool_pruning.epoch_failed_open", {
        epochId,
        arm,
        watermark,
        tokensBefore: activeTokens,
        tokensSavedEst,
        appliedDrops: decisions.length,
        ...stats,
      });
    }

    // Anti-thrashing: a failed or low-yield Epoch backs off until the pool
    // grows by `LEGACY_EPOCH_COOLDOWN_TOKENS`.
    const lowYield = tokensSavedEst < this.config.minJudgeWorthwhileTokens;
    this.cooldown =
      failedOpen || lowYield
        ? { baselineTokens: Math.max(0, partition.candidateTokens - tokensSavedEst) }
        : undefined;
  }

  /** Builds the Phase 1 plan over the candidates Phase 0 left (spec D5.1). */
  private planDecision(
    messages: readonly AgentMessage[],
    partition: CoolingWindowPartition,
    survivors: readonly { candidate: PruningCandidate; signals: Phase0Signals }[],
  ): DecisionPlan {
    const candidates = survivors.map((entry) => entry.candidate);
    const signals: Record<string, Partial<Phase0Signals>> = {};
    for (const entry of survivors) signals[entry.candidate.toolCallId] = entry.signals;
    const remainingTokens = candidates.reduce((total, c) => total + c.tokensEst, 0);

    return buildDecisionPlan({
      messages,
      partition: { ...partition, candidates, candidateTokens: remainingTokens },
      signals,
      config: this.config,
    });
  }

  /** Runs the batches (concurrency = `maxDecisionBatches`) and merges answers. */
  private async askJudge(
    plan: DecisionPlan | undefined,
    activeAfterPhase0: number,
  ): Promise<JudgeOutcome | undefined | "aborted"> {
    if (plan === undefined) return undefined;
    // Phase 1 had nothing worth asking: not a failure, just an empty band.
    if (plan.batches.length === 0) {
      return { decisions: {}, batches: 0, failedOpen: false };
    }

    const credentials = await this.credentials();
    if (credentials === undefined) {
      return { decisions: {}, batches: plan.batches.length, failedOpen: true };
    }

    const signal = this.options.getSignal?.();
    const request = (batchIndex: number): SystemOneDecisionRequest => {
      const batch = plan.batches[batchIndex];
      return { state: plan.state, questions: batch.questions };
    };
    const clientOptions: SystemOneClientOptions = {
      ...credentials,
      config: this.config,
      signal,
    };
    const judge = this.options.judge ?? requestSystemOneDecision;

    const results = await Promise.all(
      plan.batches.map((_, index) =>
        judge(request(index), clientOptions).catch(
          (error: unknown): SystemOneResult => ({
            ok: false,
            reason: "network_error",
            message: error instanceof Error ? error.message : String(error),
            latencyMs: 0,
          }),
        ),
      ),
    );

    // A user abort cancels the decision and writes nothing to the session.
    if (signal?.aborted === true) return "aborted";

    const answers: Record<string, number> = {};
    let decisionModel: string | undefined;
    let cost: number | undefined;
    let succeeded = 0;
    for (const result of results) {
      if (!result.ok) continue;
      succeeded += 1;
      Object.assign(answers, result.answers);
      if (result.model !== undefined) decisionModel = result.model;
      if (result.cost !== undefined) cost = (cost ?? 0) + result.cost;
    }

    const policy: DecisionPolicyResult = applyDecisionPolicy(plan.candidates, answers, {
      activeTokens: activeAfterPhase0,
      config: this.config,
    });

    return {
      decisions: policy.decisions,
      batches: plan.batches.length,
      failedOpen: succeeded === 0,
      ...(decisionModel === undefined ? {} : { decisionModel }),
      ...(cost === undefined ? {} : { cost }),
    };
  }

  /**
   * Gateway credentials, resolved per Epoch through the host's port. A throwing
   * resolver fails open instead of breaking the Turn.
   */
  private async credentials(): Promise<ToolPruningCredentials | undefined> {
    const resolve = this.options.getCredentials;
    if (resolve === undefined) return undefined;
    try {
      const credentials = await resolve();
      if (credentials === undefined || credentials.baseUrl.length === 0) return undefined;
      return credentials;
    } catch {
      return undefined;
    }
  }

  /** Estimated tokens a decision set reclaims, from the partition's own counts. */
  private estimateSavedTokens(
    decisions: Readonly<Record<string, ToolPruningDrop>>,
    candidates: readonly PruningCandidate[],
  ): number {
    const facts = new Map<string, PruningCandidate>();
    for (const candidate of candidates) facts.set(candidate.toolCallId, candidate);
    let saved = 0;
    for (const [toolCallId, decision] of Object.entries(decisions)) {
      const candidate = facts.get(toolCallId);
      if (candidate === undefined) continue;
      saved += decision === "drop_call" ? candidate.tokensEst : candidate.resultTokens;
    }
    return saved;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Rebuilds the masks from the active branch whenever the leaf moved (spec
   * D7). Memoised by leaf id: the rebuild is a pure walk over the branch, so it
   * costs nothing when nothing changed, and it is exactly what makes an
   * abandoned branch's decisions disappear after a Message Edit.
   */
  private syncMasksFromBranch(): void {
    const getBranch = this.options.getBranch;
    if (getBranch === undefined) return;

    const leafId = this.options.getLeafId?.() ?? null;
    if (leafId !== null && leafId === this.lastLeafId) return;
    this.lastLeafId = leafId;

    let entries: readonly ToolPruningSessionEntry[];
    try {
      entries = getBranch();
    } catch {
      // A branch read must never break the projection; keep the current masks.
      return;
    }
    const state = masksFromBranch(entries);
    this.masks = state.masks;
    this.epochCounter = Math.max(this.epochCounter, state.lastEpochId);
  }

  private trace(): ToolPruningTraceLogger | undefined {
    try {
      return this.options.getTraceLogger?.();
    } catch {
      return undefined;
    }
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
}

/** Phase 1 outcome handed back to the Epoch. */
interface JudgeOutcome {
  readonly decisions: Record<string, ToolPruningDrop>;
  readonly batches: number;
  readonly failedOpen: boolean;
  readonly decisionModel?: string;
  readonly cost?: number;
}

/** Decisions of `effective` that came from `source` (for the persisted stats). */
function countDrops(
  effective: Readonly<Record<string, ToolPruningDrop>>,
  source: Readonly<Record<string, ToolPruningDrop>>,
): number {
  let count = 0;
  for (const toolCallId of Object.keys(source)) {
    if (effective[toolCallId] !== undefined) count += 1;
  }
  return count;
}

/** Trace payload of a persisted Epoch. */
function summarizeEpoch(
  entry: ToolPruningEpochEntry,
  stats: ToolPruningEpochStats,
): Record<string, unknown> {
  return {
    epochId: entry.epochId,
    watermark: entry.watermark,
    tokensBefore: entry.tokensBefore,
    tokensSavedEst: entry.tokensSavedEst,
    decisions: Object.keys(entry.decisions).length,
    ...stats,
  };
}

/** Whether a projection changed any message identity. */
function differs(
  original: readonly AgentMessage[],
  projected: readonly AgentMessage[],
): boolean {
  if (original.length !== projected.length) return true;
  for (let i = 0; i < original.length; i++) {
    if (original[i] !== projected[i]) return true;
  }
  return false;
}
