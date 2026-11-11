/**
 * Orchestrator of the pruning Epochs (spec D3, D5 trigger logic, D6 fail-open,
 * D7 persistence).
 *
 * An Epoch is the only moment Tool Pruning touches the network and the only
 * moment it invalidates the provider's cached prefix, so this module owns
 * three responsibilities and nothing else:
 *
 * 1. **Cadence (D3).** Every `context` call measures the masked projection
 *    against a staircase of watermark steps (`config.watermarks`). Consuming a
 *    step (say `0.60`) retires that step and every lower one unless the Epoch
 *    reclaims enough tokens that a step sits at least `watermarkGapRatio`
 *    (`0.15`) above where the context landed — preventing thrashing on
 *    low-yield or failed-open prunes while letting deep cleanups re-arm upper
 *    steps in long sessions. A `compaction` entry rearms the whole staircase.
 * 2. **Decision (D5).** Phase 0 (`runSupersession`) runs first and for free;
 *    Phase 1 (the calibrated `noul` judge) only runs when what Phase 0 left is
 *    worth a round-trip (`activeTokens > (watermark - watermarkGapRatio) *
 *    contextWindow` and enough candidate tokens remain). Batches go out
 *    concurrently (at most `maxDecisionBatches`) and the merged answers feed
 *    `applyDecisionPolicy`, which owns the single conservative drop band.
 * 3. **Persistence (D7).** Every completed Epoch appends a
 *    `ToolPruningEpochEntry` carrying the step it consumed — including a
 *    short-circuited or failed-open one, because that entry *is* the consumed
 *    step. Masks are rebuilt across the whole active `getBranch()` (so pruned
 *    payloads inside Pi's kept recent tail stay masked after Compaction),
 *    while watermark steps reset at the latest `compaction` entry; a Message
 *    Edit that abandons a branch abandons both its masks and its steps.
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
  type ToolPruningCandidateAudit,
  type ToolPruningConfig,
  type ToolPruningConfigOverrides,
  type ToolPruningDrop,
  type ToolPruningEpochEntry,
  type ToolPruningEpochStats,
  type ToolPruningMaskMap,
  type ToolPruningSignals,
} from "./config";
import {
  partitionCoolingWindow,
  type CoolingWindowPartition,
  type PruningCandidate,
} from "./cooling-window";
import {
  applyDecisionPolicy,
  buildDecisionPlan,
  questionName,
  type DecisionPlan,
  type DecisionPolicyResult,
} from "./decision-state";
import { projectPruningMask } from "./mask";
import { callArguments, indexToolCalls, stringArgument } from "./messages";
import type { ToolPruningTraceLogger } from "./pruning-bridge";
import { isJudgeWorthwhile, normalizeCommand, runSupersession, type SupersessionResult } from "./supersession";
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
  /** Active branch of the session tree, for branch-aware state reconstruction. */
  getBranch?: () => readonly ToolPruningSessionEntry[];
  /** Current leaf id (`ctx.sessionManager.getLeafId()`), memoises the rebuild. */
  getLeafId?: () => string | null;
  /** Session id, the other half of the memoisation key (spec D7). */
  getSessionId?: () => string | null;
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
// Watermark staircase (spec D3)
// ---------------------------------------------------------------------------

/**
 * Configured steps, ascending and de-duplicated.
 *
 * The order is contractual: `nextWatermarkStep` relies on "the first step above
 * the consumed one" and `consumedWatermarkStep` on "the last satisfied one", so
 * a config that lists them unordered (tests, an operator override) still
 * behaves like a staircase.
 */
export function watermarkSteps(watermarks: readonly number[]): number[] {
  const steps = watermarks
    .filter((step) => Number.isFinite(step) && step > 0)
    .sort((a, b) => a - b);
  return steps.filter((step, index) => index === 0 || step !== steps[index - 1]);
}

/**
 * Next armed step: the lowest step strictly above the highest consumed one
 * (spec D3). `undefined` means every step is spent, so no Epoch can run until
 * Pi compacts the session and rearms the staircase.
 */
export function nextWatermarkStep(
  steps: readonly number[],
  highestConsumedWatermark: number,
): number | undefined {
  for (const step of steps) {
    if (step > highestConsumedWatermark) return step;
  }
  return undefined;
}

/**
 * Step an Epoch consumes: the highest configured step the context already
 * reached. Because a consumed step deactivates every lower one, triggering at
 * `0.60` also retires `0.45` (spec D3).
 */
export function consumedWatermarkStep(
  steps: readonly number[],
  activeTokens: number,
  contextWindow: number,
): number {
  let consumed = 0;
  for (const step of steps) {
    if (activeTokens >= step * contextWindow) consumed = step;
  }
  return consumed;
}

const WATERMARK_EPSILON = 1e-9;

/**
 * Effective retired watermark floor after an Epoch (spec D3).
 *
 * Steps above `watermark` were never reached and stay armed (`step > floor`).
 * Steps at or below `watermark` stay retired unless the Epoch dropped the
 * context far enough that the step now sits at least `watermarkGapRatio` above
 * the post-prune landing ratio (`step >= landingRatio + watermarkGapRatio`).
 * Because `x > min(A, B)` is identically `(x > A) || (x > B)`, a single scalar
 * floor encodes both rules without needing the configured `steps` array.
 *
 * Entries without a recorded `contextWindow` (legacy or minimal synthetic
 * fixtures) fall back to retiring up to `watermark`.
 */
export function effectiveWatermarkFloor(
  entry: {
    readonly watermark: number;
    readonly tokensBefore?: number;
    readonly tokensSavedEst?: number;
    readonly contextWindow?: number;
  },
  watermarkGapRatio: number = DEFAULT_TOOL_PRUNING_CONFIG.watermarkGapRatio,
): number {
  if (
    entry.contextWindow === undefined ||
    !Number.isFinite(entry.contextWindow) ||
    entry.contextWindow <= 0 ||
    entry.tokensBefore === undefined ||
    !Number.isFinite(entry.tokensBefore) ||
    entry.tokensSavedEst === undefined ||
    !Number.isFinite(entry.tokensSavedEst)
  ) {
    return entry.watermark;
  }
  const tokensAfter = Math.max(0, entry.tokensBefore - Math.max(0, entry.tokensSavedEst));
  const landingRatio = tokensAfter / entry.contextWindow;
  const gap = Number.isFinite(watermarkGapRatio) ? Math.max(0, watermarkGapRatio) : 0;
  return Math.min(entry.watermark, Math.max(0, landingRatio + gap - WATERMARK_EPSILON));
}

/** Provider-measured context of one projection, plus its correction inputs. */
export interface ToolPruningTokenMeasurement {
  /** The masked `AgentMessage[]` for the provider. */
  messages: AgentMessage[];
  /** Context tokens of the masked projection (spec D3). */
  activeTokens: number;
  /** Tokens the mask removed that the provider has not counted yet (see below). */
  newlyMaskedBeforeUsage: number;
  /** Whether the projection carries a usable provider `usage` at all. */
  hasUsage: boolean;
  /** Whether the projection differs from the input (identity comparison). */
  changed: boolean;
}

/** Index, token count and timestamp of the last assistant message with a valid `usage`. */
interface UsageBoundary {
  readonly index: number;
  readonly tokens: number;
  readonly timestamp: number;
}

/**
 * The masks one Epoch applied, as recovered from the session branch.
 *
 * `timestamp` is the Epoch entry's own timestamp, i.e. the moment its masks
 * started reaching the provider.
 */
export interface ToolPruningMaskApplication {
  readonly timestamp: number;
  readonly decisions: ToolPruningMaskMap;
}

/**
 * Measures the active context of a projection, applying the provider-`usage`
 * correction of spec D3:
 *
 * `calculateContextTokens(usage) - newlyMaskedBeforeUsage + trailing`
 *
 * The `usage` of the last assistant message was reported by the provider for a
 * projection that already carried every mask applied **at that point**, so only
 * the reductions applied **since then** may be subtracted. Subtracting the whole
 * mask's reduction would double-subtract every earlier Epoch's saving and make
 * a pruned session look far emptier than it is, hiding the next watermark step
 * (or, worse, spending a lower one). `applications` is the per-Epoch mask
 * history rebuilt from the branch (`masksFromBranch`), which is what makes "as
 * of that point" reconstructible after a reload.
 *
 * A session with no valid `usage` yet (fresh, or just after a Compaction) falls
 * back to estimating every message.
 */
export function measureProjection(
  messages: readonly AgentMessage[],
  masks: ToolPruningMaskMap,
  config: ToolPruningConfig,
  applications: readonly ToolPruningMaskApplication[] = [],
): ToolPruningTokenMeasurement {
  const projection = projectPruningMask(messages, masks, config);
  const boundary = lastUsageBoundary(messages);

  if (boundary === undefined) {
    let estimated = 0;
    for (const message of projection.messages) estimated += estimateTokens(message);
    return {
      messages: projection.messages,
      activeTokens: estimated,
      newlyMaskedBeforeUsage: 0,
      hasUsage: false,
      changed: differs(messages, projection.messages),
    };
  }

  // What the provider already counted as removed when it reported `usage`: the
  // masks of every Epoch that had run before that message was produced.
  const previouslyMasked = masksAppliedBefore(applications, boundary.timestamp);
  const seen = projectPruningMask(messages, previouslyMasked, config);

  // Only the NEW reduction of the counted prefix is subtracted.
  let newlyMaskedBeforeUsage = 0;
  for (let index = 0; index <= boundary.index; index++) {
    const removed = projection.removedTokens[index] ?? 0;
    const alreadySeen = seen.removedTokens[index] ?? 0;
    newlyMaskedBeforeUsage += Math.max(0, removed - alreadySeen);
  }

  // Everything after the boundary is estimated, net of its own reductions.
  let trailingTokens = 0;
  for (let index = boundary.index + 1; index < messages.length; index++) {
    const removed = projection.removedTokens[index] ?? 0;
    trailingTokens += Math.max(0, estimateTokens(messages[index]) - removed);
  }

  return {
    messages: projection.messages,
    activeTokens: Math.max(0, boundary.tokens - newlyMaskedBeforeUsage + trailingTokens),
    newlyMaskedBeforeUsage,
    hasUsage: true,
    changed: differs(messages, projection.messages),
  };
}

/**
 * Masks the provider had already seen at `timestamp`: every Epoch whose entry is
 * at or before it. An Epoch always runs at a `context` event, i.e. before the
 * request that produces the next assistant message, so a mask applied by an
 * Epoch that ran no later than the usage message was part of what the provider
 * counted.
 */
function masksAppliedBefore(
  applications: readonly ToolPruningMaskApplication[],
  timestamp: number,
): ToolPruningMaskMap {
  const masks: Record<string, ToolPruningDrop> = {};
  for (const application of applications) {
    if (application.timestamp > timestamp) continue;
    Object.assign(masks, application.decisions);
  }
  return masks;
}

/**
 * Active context tokens of an already-masked projection: the provider's own
 * count at the last assistant usage plus an estimate of everything after it.
 *
 * This is the uncorrected estimator; `measureProjection` is what the cadence
 * uses, because only it knows how many tokens the mask removed from the prefix
 * the `usage` was measured on.
 */
export function estimateActiveTokens(messages: readonly AgentMessage[]): number {
  const boundary = lastUsageBoundary(messages);
  if (boundary === undefined) {
    let estimated = 0;
    for (const message of messages) estimated += estimateTokens(message);
    return estimated;
  }
  let trailingTokens = 0;
  for (let index = boundary.index + 1; index < messages.length; index++) {
    trailingTokens += estimateTokens(messages[index]);
  }
  return boundary.tokens + trailingTokens;
}

/**
 * Last assistant message whose `usage` Pi would trust, mirroring its own
 * `getAssistantUsage`: aborted, errored and all-zero usages are not evidence of
 * context size.
 */
function lastUsageBoundary(messages: readonly AgentMessage[]): UsageBoundary | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role !== "assistant") continue;
    if (message.stopReason === "aborted" || message.stopReason === "error") continue;
    const usage = message.usage;
    if (usage === undefined) continue;
    const tokens = calculateContextTokens(usage);
    if (tokens <= 0) continue;
    return { index, tokens, timestamp: message.timestamp };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Branch-aware state reconstruction (spec D7)
// ---------------------------------------------------------------------------

/** Masks, epoch counter, consumed step and mask history of one session branch. */
export interface ToolPruningBranchState {
  /** Terminal drops persisted on the branch, keyed by `toolCallId`. */
  readonly masks: Record<string, ToolPruningDrop>;
  /** Highest `epochId` seen on the branch (`0` when none). */
  readonly lastEpochId: number;
  /** Highest watermark step consumed since the last Compaction (`0` when none). */
  readonly highestConsumedWatermark: number;
  /** Per-Epoch mask applications in branch order (spec D3 usage correction). */
  readonly applications: readonly ToolPruningMaskApplication[];
}

/** Options for branch reconstruction. */
export interface MasksFromBranchOptions {
  /** Margin above a prune's landing ratio required to re-arm a step (spec D3). */
  readonly watermarkGapRatio?: number;
}

/**
 * Rebuilds the pruning state from a session branch (spec D7).
 *
 * Masks, mask-application timestamps and `lastEpochId` are accumulated across
 * the **entire** active branch — including entries before a `type: "compaction"`
 * entry — because Pi's native Compaction preserves ~`20k` recent tokens
 * verbatim (`firstKeptEntryId`), and forgetting pre-compaction masks would
 * resurrect already-pruned tool outputs inside that kept tail (while keeping
 * `applications` paired prevents `measureProjection` from subtracting those
 * pre-compaction savings a second time).
 *
 * By contrast, `highestConsumedWatermark` resets to `0` at every `compaction`
 * entry so the watermark staircase is freshly armed for the new window cycle.
 * An Epoch decided on an Abandoned Branch after a Message Edit is absent from
 * `getBranch()`, so both its masks and its watermark state disappear.
 */
export function masksFromBranch(
  entries: readonly ToolPruningSessionEntry[],
  options: MasksFromBranchOptions = {},
): ToolPruningBranchState {
  const gapRatio = options.watermarkGapRatio ?? DEFAULT_TOOL_PRUNING_CONFIG.watermarkGapRatio;
  const masks: Record<string, ToolPruningDrop> = {};
  const applications: ToolPruningMaskApplication[] = [];
  let lastEpochId = 0;
  let highestConsumedWatermark = 0;
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (entry.type === "compaction") {
      highestConsumedWatermark = 0;
      continue;
    }
    const epoch = readEpochEntry(entry);
    if (epoch === undefined) continue;
    lastEpochId = Math.max(lastEpochId, epoch.epochId);
    if (epoch.contextWindow !== undefined) {
      highestConsumedWatermark = effectiveWatermarkFloor(epoch, gapRatio);
    } else {
      highestConsumedWatermark = Math.max(highestConsumedWatermark, epoch.watermark);
    }
    applications.push({ timestamp: epoch.timestamp, decisions: epoch.decisions });
    for (const [toolCallId, decision] of Object.entries(epoch.decisions)) {
      masks[toolCallId] = decision;
    }
  }
  return { masks, lastEpochId, highestConsumedWatermark, applications };
}

/**
 * Reads one `tool-pruning` custom entry defensively: a newer or corrupted entry
 * must never break the projection, so anything that does not match the schema
 * is ignored instead of throwing inside `pi.on("context")`.
 */
function readEpochEntry(
  entry: ToolPruningSessionEntry,
):
  | (Pick<ToolPruningEpochEntry, "epochId" | "watermark" | "timestamp" | "decisions"> &
      Partial<Pick<ToolPruningEpochEntry, "tokensBefore" | "tokensSavedEst" | "contextWindow">>)
  | undefined {
  if (entry.type !== "custom" || entry.customType !== TOOL_PRUNING_ENTRY_TYPE) return undefined;
  const data = entry.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return undefined;
  const record = data as Record<string, unknown>;
  if (record.version !== 1) return undefined;
  if (typeof record.epochId !== "number" || !Number.isFinite(record.epochId)) return undefined;
  // A missing or invalid step cannot consume anything, so the sanitation here
  // is what keeps a corrupted entry from stalling the staircase forever.
  const watermark =
    typeof record.watermark === "number" && Number.isFinite(record.watermark) && record.watermark >= 0
      ? record.watermark
      : 0;
  // Without a usable timestamp the masks cannot be placed on the provider's
  // timeline; treating them as the oldest possible application makes them count
  // as already seen, which can only under-estimate the correction.
  const timestamp =
    typeof record.timestamp === "number" && Number.isFinite(record.timestamp)
      ? record.timestamp
      : Number.NEGATIVE_INFINITY;
  const tokensBefore =
    typeof record.tokensBefore === "number" && Number.isFinite(record.tokensBefore) && record.tokensBefore >= 0
      ? record.tokensBefore
      : undefined;
  const tokensSavedEst =
    typeof record.tokensSavedEst === "number" &&
    Number.isFinite(record.tokensSavedEst) &&
    record.tokensSavedEst >= 0
      ? record.tokensSavedEst
      : undefined;
  const contextWindow =
    typeof record.contextWindow === "number" &&
    Number.isFinite(record.contextWindow) &&
    record.contextWindow > 0
      ? record.contextWindow
      : undefined;
  const rawDecisions = record.decisions;
  if (typeof rawDecisions !== "object" || rawDecisions === null || Array.isArray(rawDecisions)) {
    return undefined;
  }

  const decisions: Record<string, ToolPruningDrop> = {};
  for (const [toolCallId, decision] of Object.entries(rawDecisions)) {
    if (decision === "drop_result" || decision === "drop_call") decisions[toolCallId] = decision;
  }
  return {
    epochId: record.epochId,
    watermark,
    timestamp,
    decisions,
    ...(tokensBefore === undefined ? {} : { tokensBefore }),
    ...(tokensSavedEst === undefined ? {} : { tokensSavedEst }),
    ...(contextWindow === undefined ? {} : { contextWindow }),
  };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/** Inputs of one Epoch. */
interface EpochInput {
  /** Masked projection the Epoch measures and decides on. */
  messages: readonly AgentMessage[];
  activeTokens: number;
  partition: CoolingWindowPartition;
  contextWindow: number;
  /** Step this Epoch consumes (spec D7). */
  watermark: number;
}

/**
 * Stateful orchestrator of one Pi session's pruning Epochs.
 *
 * The host (the Tool Pruning extension) forwards `onContext(event.messages)` on
 * every `context` event. The runner keeps only per-session state — the active
 * masks, the highest consumed watermark, the leaf they were derived from and
 * the Epoch counter — so a relayed or rewound session is rebuilt from the
 * branch at any time.
 */
export class ToolPruningEpochRunner {
  readonly config: ToolPruningConfig;
  private readonly steps: readonly number[];
  private readonly options: ToolPruningEpochRunnerOptions;
  private masks: Record<string, ToolPruningDrop> = {};
  private highestConsumedWatermark = 0;
  private epochCounter = 0;
  /** Per-Epoch mask history of the branch (spec D3 usage correction). */
  private applications: readonly ToolPruningMaskApplication[] = [];
  /** `(sessionId, leafId)` the current state was derived from (spec D7). */
  private branchKey: string | undefined;

  constructor(options: ToolPruningEpochRunnerOptions) {
    this.options = options;
    this.config = { ...DEFAULT_TOOL_PRUNING_CONFIG, ...options.config };
    this.steps = watermarkSteps(this.config.watermarks);
  }

  /** Masks currently applied on the active branch (a snapshot copy). */
  get activeMasks(): ToolPruningMaskMap {
    return { ...this.masks };
  }

  /** Highest watermark step consumed since the last Compaction. */
  get consumedWatermark(): number {
    return this.highestConsumedWatermark;
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

    this.syncBranchState();
    const measurement = measureProjection(
      messages,
      this.masks,
      this.config,
      this.applications,
    );
    /** Nothing triggered: the already-measured projection is what to return. */
    const unchanged = (): ToolPruningProjection => ({
      messages: measurement.messages,
      changed: measurement.changed,
    });

    const contextWindow = this.options.getContextWindow?.();
    // No resolved model means no window to measure against: never trigger.
    if (contextWindow === undefined || contextWindow <= 0) return unchanged();

    const nextWatermark = nextWatermarkStep(this.steps, this.highestConsumedWatermark);
    // Every step consumed: nothing can run until Pi compacts the session.
    if (nextWatermark === undefined) return unchanged();
    if (measurement.activeTokens < nextWatermark * contextWindow) return unchanged();

    const partition = partitionCoolingWindow(measurement.messages, {
      config: this.config,
      masks: this.masks,
      contextWindow,
    });
    // Never pay latency (nor break the KV-cache) for a marginal saving.
    if (partition.candidateTokens < this.config.minWorthwhilePruneTokens) return unchanged();

    const consumed = consumedWatermarkStep(this.steps, measurement.activeTokens, contextWindow);
    await this.runEpoch({
      messages: measurement.messages,
      activeTokens: measurement.activeTokens,
      partition,
      contextWindow,
      // Defensive: a trigger always satisfies `nextWatermark`, which is the
      // lower bound of what this Epoch may consume.
      watermark: Math.max(consumed, nextWatermark),
    });

    // The Epoch added masks: fold them into the same projection so the Turn
    // pays at most one prefix update.
    const projected = projectPruningMask(messages, this.masks, this.config).messages;
    return { messages: projected, changed: differs(messages, projected) };
  }

  // -------------------------------------------------------------------------
  // Epoch execution
  // -------------------------------------------------------------------------

  /** Runs Phase 0 → short-circuit → Phase 1 → persistence (spec D5 + D6 + D7). */
  private async runEpoch(input: EpochInput): Promise<void> {
    const { messages, activeTokens, partition, contextWindow, watermark } = input;
    const startedAt = this.now();
    this.epochCounter += 1;
    const epochId = this.epochCounter;

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
      watermark,
      remainingCandidateTokens: supersession.remainingTokens,
      config: this.config,
    });
    const plan = judgeRan
      ? this.planDecision(messages, partition, supersession.remaining)
      : undefined;
    const outcome = await this.askJudge(plan, activeAfterPhase0);
    if (outcome === "aborted") {
      // Spec D6: a user abort cancels the Epoch instantly. Nothing is written
      // and the step stays armed, because the Turn was cancelled by the user.
      this.trace()?.info("tool_pruning.epoch_aborted", { epochId, watermark, activeTokens });
      return;
    }

    // A failed judge still applies what Phase 0 proved (spec D6): the entry
    // below is what consumes the step, so a degraded service can never retry on
    // the same step.
    const failedOpen = outcome?.failedOpen === true;
    const decisions: Record<string, ToolPruningDrop> = {
      ...supersession.decisions,
      ...(outcome?.decisions ?? {}),
    };
    const tokensSavedEst = this.estimateSavedTokens(decisions, partition.candidates);
    // Total candidates considered by this Epoch: what Phase 0 dropped plus what
    // Phase 1 judged. Counting only the judged ones would hide the deterministic
    // drops from the audit trail whenever the judge also ran.
    const survivors = plan?.candidates.length ?? supersession.remaining.length;
    const stats: ToolPruningEpochStats = {
      deterministicDrops: countDrops(decisions, supersession.decisions),
      judgeDrops: countDrops(decisions, outcome?.decisions ?? {}),
      candidatesEvaluated: supersession.droppedCount + survivors,
      batches: outcome?.batches ?? 0,
      latencyMs: this.now() - startedAt,
      ...(outcome?.decisionModel === undefined ? {} : { decisionModel: outcome.decisionModel }),
      ...(outcome?.cost === undefined ? {} : { cost: outcome.cost }),
      ...(failedOpen ? { failedOpen: true } : {}),
    };

    const entry: ToolPruningEpochEntry = {
      version: 1,
      epochId,
      watermark,
      timestamp: startedAt,
      tokensBefore: activeTokens,
      tokensSavedEst,
      contextWindow,
      decisions,
      stats,
      audit: buildCandidateAudit(messages, partition.candidates, supersession, plan, outcome),
    };

    this.masks = { ...this.masks, ...decisions };
    this.applications = [...this.applications, { timestamp: entry.timestamp, decisions }];
    this.highestConsumedWatermark = effectiveWatermarkFloor(entry, this.config.watermarkGapRatio);
    // The appended entry moves the leaf: force the next projection to rebuild
    // from the branch instead of trusting the local state.
    this.branchKey = undefined;
    this.options.appendEntry?.(TOOL_PRUNING_ENTRY_TYPE, entry);

    const summary = summarizeEpoch(entry, stats);
    this.trace()?.info("tool_pruning.epoch_completed", summary);
    if (failedOpen) this.trace()?.warn("tool_pruning.epoch_failed_open", summary);
  }

  /** Builds the Phase 1 plan over the candidates Phase 0 left (spec D5.1). */
  private planDecision(
    messages: readonly AgentMessage[],
    partition: CoolingWindowPartition,
    survivors: readonly { candidate: PruningCandidate; signals: ToolPruningSignals }[],
  ): DecisionPlan {
    const candidates = survivors.map((entry) => entry.candidate);
    const signals: Record<string, Partial<ToolPruningSignals>> = {};
    for (const entry of survivors) signals[entry.candidate.toolCallId] = entry.signals;
    const remainingTokens = candidates.reduce((total, candidate) => total + candidate.tokensEst, 0);

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
  ): Promise<JudgeOutcome | "aborted" | undefined> {
    if (plan === undefined) return undefined;
    // Phase 1 had nothing worth asking: not a failure, just an empty band.
    if (plan.batches.length === 0) {
      return { decisions: {}, answers: {}, batches: 0, failedOpen: false };
    }

    const signal = this.options.getSignal?.();
    // Aborted before the first request: no point in paying for the round-trip.
    if (isAborted(signal)) return "aborted";

    const credentials = await this.credentials();
    if (isAborted(signal)) return "aborted";
    if (credentials === undefined) {
      return { decisions: {}, answers: {}, batches: plan.batches.length, failedOpen: true };
    }

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

    // `planDecisionBatches` already caps the plan at `maxDecisionBatches`, so a
    // single `Promise.all` is the documented concurrency limit (spec D5.2).
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
    if (isAborted(signal)) return "aborted";

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
      answers,
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
   * Rebuilds the pruning state from the active branch whenever the leaf (or the
   * session) moved (spec D7). Memoised by `(sessionId, leafId)`: the rebuild is
   * a pure walk over the branch, so it costs nothing when nothing changed, and
   * it is exactly what makes an abandoned branch's decisions — and its consumed
   * watermark — disappear after a Message Edit, and what rearms the whole
   * staircase after a `compaction` entry.
   */
  private syncBranchState(): void {
    const getBranch = this.options.getBranch;
    if (getBranch === undefined) return;

    const key = this.currentBranchKey();
    if (key === this.branchKey) return;

    let entries: readonly ToolPruningSessionEntry[];
    try {
      entries = getBranch();
    } catch {
      // A branch read must never break the projection; keep the current state.
      return;
    }
    this.branchKey = key;

    const state = masksFromBranch(entries, {
      watermarkGapRatio: this.config.watermarkGapRatio,
    });
    this.masks = state.masks;
    this.applications = state.applications;
    this.epochCounter = Math.max(this.epochCounter, state.lastEpochId);
    this.highestConsumedWatermark = state.highestConsumedWatermark;
  }

  private currentBranchKey(): string {
    let leafId: string | null = null;
    try {
      leafId = this.options.getLeafId?.() ?? null;
    } catch {
      leafId = null;
    }
    let sessionId: string | null = null;
    try {
      sessionId = this.options.getSessionId?.() ?? null;
    } catch {
      sessionId = null;
    }
    // `\u0000` cannot appear in a Pi id, so the pair cannot collide.
    return `${sessionId ?? ""}\u0000${leafId ?? ""}`;
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

/**
 * Abort state read through a helper: reading `signal.aborted` inline would let
 * the compiler narrow the property after the first check, hiding the second
 * abort (the one that matters, because it happens during the requests).
 */
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

/** Phase 1 outcome handed back to the Epoch. */
interface JudgeOutcome {
  readonly decisions: Record<string, ToolPruningDrop>;
  readonly answers: Readonly<Record<string, number>>;
  readonly batches: number;
  readonly failedOpen: boolean;
  readonly decisionModel?: string;
  readonly cost?: number;
}

/**
 * Per-candidate audit trail persisted with the Epoch entry so post-hoc analysis
 * (`analyze:pruning` and `trace-analyzer`) can inspect `noul` distributions,
 * Phase 0 vs Phase 1 yield, regret (pruned target re-read/re-run later) and
 * missed drops without having to re-execute the decision engine.
 */
function buildCandidateAudit(
  messages: readonly AgentMessage[],
  candidates: readonly PruningCandidate[],
  supersession: SupersessionResult,
  plan: DecisionPlan | undefined,
  outcome: JudgeOutcome | undefined,
): ToolPruningCandidateAudit[] {
  const calls = indexToolCalls(messages);
  const signalsByCallId = new Map<string, ToolPruningSignals>();
  for (const item of supersession.remaining) {
    signalsByCallId.set(item.candidate.toolCallId, item.signals);
  }
  const decisionCandidateByCallId = new Map(
    (plan?.candidates ?? []).map((candidate) => [candidate.toolCallId, candidate]),
  );
  const leftoverCallIds = new Set(
    (plan?.leftovers ?? []).map((candidate) => candidate.toolCallId),
  );
  const answers = outcome?.answers ?? {};

  return candidates.map((candidate) => {
    const args = callArguments(calls.get(candidate.toolCallId));
    const target = extractAuditTarget(candidate.toolName, args);
    const phase0Drop = supersession.decisions[candidate.toolCallId];
    if (phase0Drop !== undefined) {
      return {
        toolCallId: candidate.toolCallId,
        toolName: candidate.toolName,
        ...(target === undefined ? {} : { target }),
        tokensEst: candidate.tokensEst,
        resultTokens: candidate.resultTokens,
        isError: candidate.isError,
        source: "phase0",
        decision: phase0Drop,
      };
    }

    const signals = signalsByCallId.get(candidate.toolCallId);
    const decisionCandidate = decisionCandidateByCallId.get(candidate.toolCallId);
    const isLeftover =
      plan === undefined ||
      decisionCandidate === undefined ||
      leftoverCallIds.has(candidate.toolCallId);
    const judgeDrop = outcome?.decisions[candidate.toolCallId];
    const keepResult =
      decisionCandidate === undefined
        ? undefined
        : answers[questionName("result", decisionCandidate.id)];
    const keepCall =
      decisionCandidate === undefined
        ? undefined
        : answers[questionName("call", decisionCandidate.id)];

    return {
      toolCallId: candidate.toolCallId,
      toolName: candidate.toolName,
      ...(target === undefined ? {} : { target }),
      tokensEst: candidate.tokensEst,
      resultTokens: candidate.resultTokens,
      isError: candidate.isError,
      source: isLeftover ? "leftover" : "judge",
      decision: judgeDrop ?? "keep",
      ...(keepResult === undefined ? {} : { keepResult }),
      ...(keepCall === undefined ? {} : { keepCall }),
      ...(signals?.editedLater ? { editedLater: true } : {}),
      ...(signals?.sameCommandRanLater ? { sameCommandRanLater: true } : {}),
      ...(signals?.laterCommandSucceeded ? { laterCommandSucceeded: true } : {}),
    };
  });
}

function extractAuditTarget(
  toolName: string,
  args: Readonly<Record<string, unknown>> | undefined,
): string | undefined {
  if (args === undefined) return undefined;
  const rawPath = stringArgument(args, "path") ?? stringArgument(args, "file_path");
  if (rawPath !== undefined) return rawPath.slice(0, 160);
  if (toolName === "bash") {
    const rawCommand = stringArgument(args, "command");
    if (rawCommand === undefined) return undefined;
    const normalized = normalizeCommand(rawCommand);
    return (normalized.length > 0 ? normalized : rawCommand).slice(0, 160);
  }
  const pattern = stringArgument(args, "pattern") ?? stringArgument(args, "glob");
  return pattern?.slice(0, 160);
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
  for (let index = 0; index < original.length; index++) {
    if (original[index] !== projected[index]) return true;
  }
  return false;
}
