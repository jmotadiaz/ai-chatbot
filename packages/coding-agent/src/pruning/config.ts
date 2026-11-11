/**
 * Tool Pruning configuration, defaults and the types shared by every pruning
 * module.
 *
 * This module is pure and dependency-light on purpose: Pi loads the extension
 * through jiti in its own module runtime, so a single worker import here would
 * duplicate (and desynchronise) worker state inside the extension. The only
 * dependency is the Pi SDK types, reached through the public package entry.
 *
 * See spec D1 (projection), D7 (`ToolPruningEpochEntry`) and the default
 * parameter table at the end of `.scratch/tool-pruning/spec.md`.
 */
import type { ContextEvent } from "@earendil-works/pi-coding-agent";

/**
 * Message union Pi hands to `pi.on("context")`.
 *
 * Derived from the SDK event instead of importing `@earendil-works/pi-ai` or
 * `@earendil-works/pi-agent-core` directly: those packages are not direct
 * dependencies of this workspace package, and the event already carries the
 * exact union (including coding-agent custom messages such as
 * `BashExecutionMessage` and `CompactionSummaryMessage`).
 */
export type AgentMessage = ContextEvent["messages"][number];

/** Assistant turn: prose, reasoning and tool calls. */
export type AssistantMessage = Extract<AgentMessage, { role: "assistant" }>;

/** Tool result envelope paired with its `ToolCall` by `toolCallId`. */
export type ToolResultMessage = Extract<AgentMessage, { role: "toolResult" }>;

/** Content blocks an assistant turn can carry, in emission order. */
export type AssistantContent = AssistantMessage["content"][number];

/** A single tool invocation block inside an `AssistantMessage`. */
export type ToolCall = Extract<AssistantContent, { type: "toolCall" }>;

/** Prose block inside an `AssistantMessage`. */
export type TextContent = Extract<AssistantContent, { type: "text" }>;

/** Reasoning block inside an `AssistantMessage`. */
export type ThinkingContent = Extract<AssistantContent, { type: "thinking" }>;

/** Image block inside a `ToolResultMessage`. */
export type ImageContent = Extract<ToolResultMessage["content"][number], { type: "image" }>;

/**
 * What Tool Pruning can do to one paired `(ToolCall, ToolResultMessage)`:
 *
 * - `keep` touches nothing and is never persisted; the call stays in the
 *   Living Candidate Pool and is re-evaluated in later Epochs.
 * - `drop_result` keeps the call visible (and the result envelope) but replaces
 *   the result body with a head + tail stub.
 * - `drop_call` removes the call block and its result message together.
 */
export type ToolPruningDecision = "keep" | "drop_result" | "drop_call";

/** A decision that is persisted and applied to the projection. */
export type ToolPruningDrop = Exclude<ToolPruningDecision, "keep">;

/**
 * Mask applied to the projected context, keyed by `toolCallId`.
 *
 * Rebuilt from the active session branch before every projection, so a Message
 * Edit that abandons a branch also abandons its masks.
 */
export type ToolPruningMaskMap = Readonly<Record<string, ToolPruningDrop>>;

/**
 * Knobs of the pruning engine. Defaults reproduce the spec's parameter table;
 * tests and `WorkerRuntimeConfig` may override individual values.
 */
export interface ToolPruningConfig {
  /** Master switch for Tool Pruning. */
  enabled: boolean;
  /**
   * Ascending fractions of `contextWindow` that arm Epochs (spec D3). An Epoch
   * consumes the highest step the context already reached, which deactivates
   * that step and every lower one until Pi compacts the session and rearms the
   * whole staircase.
   */
  watermarks: readonly number[];
  /** Minimum prunable tokens outside the Cooling Window to start an Epoch. */
  minWorthwhilePruneTokens: number;
  /** Minimum tokens left after Phase 0 to justify the judge HTTP call. */
  minJudgeWorthwhileTokens: number;
  /** Recent tail always protected by the Cooling Window. */
  coolingRecentTokens: number;
  /** Recent paired tool calls always protected by the Cooling Window. */
  minCoolingToolCalls: number;
  /** Cap on the protection granted to the active and the last tool-using Turn. */
  maxProtectedTurnTokens: number;
  /** Characters preserved at the start of a stubbed result. */
  stubHeadChars: number;
  /** Characters preserved at the end of a stubbed result. */
  stubTailChars: number;
  /** Minimum size of an error result before `drop_result` is allowed. */
  errorTruncateMinChars: number;
  /** Budget of the `state` document sent to the decision model. */
  maxDecisionStateTokens: number;
  /** Maximum questions per decision request. */
  maxQuestionsPerBatch: number;
  /** Maximum concurrent decision requests per Epoch. */
  maxDecisionBatches: number;
  /** `noul` threshold below which a result is dropped. */
  dropResultThreshold: number;
  /** `noul` threshold below which an exploratory call is dropped entirely. */
  dropCallThreshold: number;
  /** Per-request timeout against `/v1/systemone` before failing open. */
  decisionTimeoutMs: number;
}

/**
 * Results at or below this many characters never receive `drop_result`: the
 * head + tail stub (`150 + 150` chars) would save nothing.
 */
export const MIN_TRUNCATION_CHARS = 380;

/** Session entry `customType` under which each Epoch is persisted. */
export const TOOL_PRUNING_ENTRY_TYPE = "tool-pruning";

/** Per-Epoch accounting, persisted with the entry for `trace-analyzer`. */
export interface ToolPruningEpochStats {
  /** Drops decided by Phase 0 without any network call. */
  deterministicDrops: number;
  /** Drops decided by the calibrated judge. */
  judgeDrops: number;
  /** Candidates evaluated by the Epoch. */
  candidatesEvaluated: number;
  /** Decision requests issued. */
  batches: number;
  /** Wall-clock time spent deciding. */
  latencyMs: number;
  /** Decision model reported by the Gateway, when known. */
  decisionModel?: string;
  /** Cost reported by the Gateway, when known. */
  cost?: number;
  /** Set when the judge failed and only Phase 0 decisions were applied. */
  failedOpen?: boolean;
}

/**
 * Session entry persisted by `pi.appendEntry("tool-pruning", entry)` after an
 * Epoch with at least one effective decision (spec D7).
 */
export interface ToolPruningEpochEntry {
  version: 1;
  epochId: number;
  /** Step of `watermarks` reached and consumed by this Epoch (e.g. 0.45, 0.60, 0.75). */
  watermark: number;
  timestamp: number;
  tokensBefore: number;
  tokensSavedEst: number;
  decisions: Record<string, ToolPruningDrop>;
  stats: ToolPruningEpochStats;
}

/** Overrides accepted by `WorkerRuntimeConfig` and by tests. */
export type ToolPruningConfigOverrides = Partial<ToolPruningConfig>;

/** Spec defaults, frozen so no runtime branch can mutate the shared table. */
export const DEFAULT_TOOL_PRUNING_CONFIG: Readonly<ToolPruningConfig> = Object.freeze({
  enabled: true,
  watermarks: Object.freeze([0.45, 0.6, 0.75]),
  minWorthwhilePruneTokens: 8_000,
  minJudgeWorthwhileTokens: 4_000,
  coolingRecentTokens: 16_000,
  minCoolingToolCalls: 6,
  maxProtectedTurnTokens: 40_000,
  stubHeadChars: 150,
  stubTailChars: 150,
  errorTruncateMinChars: 2_000,
  maxDecisionStateTokens: 20_000,
  maxQuestionsPerBatch: 80,
  maxDecisionBatches: 3,
  dropResultThreshold: 0.25,
  dropCallThreshold: 0.15,
  decisionTimeoutMs: 4_000,
});
