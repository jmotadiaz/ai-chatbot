/**
 * Cooling Window, Living Candidate Pool and per-tool eligibility (spec D2 + D4).
 *
 * The Cooling Window is the protected tail of an already-masked context: the
 * union of the recent tail (`coolingRecentTokens` tokens and at least
 * `minCoolingToolCalls` paired calls), the active Turn and the last completed
 * Turn that used tools. Everything before it is the Living Candidate Pool:
 * paired, unmasked calls the Epoch is allowed to prune according to the
 * per-tool policy, the Error Gate and the minimum truncation size.
 *
 * The composed rule exists to resolve the Ratchet Bug: a Turn that only reads
 * files to form a plan stays protected across an intermediate prose-only Turn,
 * so the plan's reads are not immortalised and are not pruned while they are
 * still in use either. Both protected Turns are capped at
 * `maxProtectedTurnTokens`, so a single marathon Turn or Subagent can still
 * prune the obsolete explorations of its first half.
 *
 * Everything here is pure and dependency-light, mirroring `mask.ts`: Pi loads
 * the extension through jiti in its own module runtime, so this module must
 * never import worker `src/` code.
 *
 * Token estimation uses Pi's own `estimateTokens` (a conservative chars/4
 * heuristic over text, thinking and tool-call arguments) instead of a local
 * heuristic: it is exported from the SDK's public entry, needs no worker
 * import, and keeps pruning thresholds on exactly the same scale Pi uses for
 * its compaction reserve.
 */
import { estimateTokens } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_TOOL_PRUNING_CONFIG,
  MIN_TRUNCATION_CHARS,
  type AgentMessage,
  type ToolCall,
  type ToolPruningConfig,
  type ToolPruningMaskMap,
  type ToolResultMessage,
} from "./config";
import { toolResultText } from "./mask";

/** How safely a tool can lose part of its trace (spec D2). */
export type ToolPruningToolCategory = "exploratory" | "execution" | "mutating";

/** Actions D2 allows for one tool name. */
export interface ToolPruningToolPolicy {
  readonly category: ToolPruningToolCategory;
  /** Whether `drop_result` is allowed for results of this tool. */
  readonly allowsDropResult: boolean;
  /** Whether `drop_call` is allowed for calls of this tool. */
  readonly allowsDropCall: boolean;
}

/** Pure reads with no side effects: re-runnable on demand. */
const EXPLORATORY_TOOLS: ReadonlySet<string> = new Set(["read", "grep", "find", "ls"]);

/** Execution: the command itself is indispensable traceability, its output is not. */
const EXECUTION_TOOLS: ReadonlySet<string> = new Set(["bash"]);

const EXPLORATORY_POLICY: ToolPruningToolPolicy = Object.freeze({
  category: "exploratory",
  allowsDropResult: true,
  allowsDropCall: true,
});

const EXECUTION_POLICY: ToolPruningToolPolicy = Object.freeze({
  category: "execution",
  allowsDropResult: true,
  allowsDropCall: false,
});

/**
 * Mutations (`edit`, `write`), delegation (`subagent`), publishing
 * (`publish_artifact`) and every unlisted or future tool are default-deny:
 * their call and result are part of the working state.
 */
const MUTATING_POLICY: ToolPruningToolPolicy = Object.freeze({
  category: "mutating",
  allowsDropResult: false,
  allowsDropCall: false,
});

/** Policy for one tool name; unknown tools fall back to default-deny. */
export function toolPolicyFor(toolName: string): ToolPruningToolPolicy {
  if (EXPLORATORY_TOOLS.has(toolName)) return EXPLORATORY_POLICY;
  if (EXECUTION_TOOLS.has(toolName)) return EXECUTION_POLICY;
  return MUTATING_POLICY;
}

/** Facts about a paired result the eligibility rules depend on. */
export interface PruningEligibilityInput {
  toolName: string;
  isError: boolean;
  /** Characters of text the result contributes, image blocks excluded. */
  chars: number;
  /** Whether the result carries image blocks (they are always worth omitting). */
  hasImages?: boolean;
}

/** What D2 allows for one paired call, before any judge probability arrives. */
export interface PruningEligibility {
  /** `drop_result` is allowed and would actually save tokens. */
  dropResult: boolean;
  /** `drop_call` is allowed. */
  dropCall: boolean;
  /**
   * Error result above `errorTruncateMinChars`: its body may only be dropped
   * once Phase 0 certifies a later successful read/command on the same target
   * or the judge scores it below `dropResultThreshold` (spec D2.3).
   */
  requiresSupersessionOrJudge: boolean;
}

const NO_ELIGIBILITY: PruningEligibility = Object.freeze({
  dropResult: false,
  dropCall: false,
  requiresSupersessionOrJudge: false,
});

/**
 * Eligibility of one paired call per tool policy, Error Gate and minimum
 * truncation size.
 *
 * - Errors never receive `drop_call` (remembering that a path or command
 *   failed stops the agent from retrying it), short errors are forced `keep`
 *   and only bulky errors may lose their body, conditionally.
 * - Results at or below `MIN_TRUNCATION_CHARS` never receive `drop_result`:
 *   the head + tail stub would not save anything. Images make a result
 *   truncatable regardless of its text length.
 */
export function pruningEligibilityFor(
  input: PruningEligibilityInput,
  config: ToolPruningConfig = DEFAULT_TOOL_PRUNING_CONFIG,
): PruningEligibility {
  const policy = toolPolicyFor(input.toolName);
  const stubbable = input.hasImages === true || input.chars > MIN_TRUNCATION_CHARS;

  if (input.isError) {
    // Mutating tools are excluded before the size gate: their errors always stay.
    if (!policy.allowsDropResult) return NO_ELIGIBILITY;
    // Short errors are forced keep, image blocks included: the gate is by size.
    if (input.chars <= config.errorTruncateMinChars) return NO_ELIGIBILITY;
    return {
      dropResult: stubbable,
      dropCall: false,
      requiresSupersessionOrJudge: stubbable,
    };
  }

  return {
    dropResult: policy.allowsDropResult && stubbable,
    dropCall: policy.allowsDropCall,
    requiresSupersessionOrJudge: false,
  };
}

/** One paired `(ToolCall, ToolResultMessage)` outside the Cooling Window. */
export interface PruningCandidate {
  readonly toolCallId: string;
  readonly toolName: string;
  /** Index of the `AssistantMessage` carrying the call block. */
  readonly assistantIndex: number;
  /** Index of the paired `ToolResultMessage`. */
  readonly resultIndex: number;
  readonly isError: boolean;
  /** Characters of result text; image blocks excluded. */
  readonly chars: number;
  /** Tokens the result body contributes today. */
  readonly resultTokens: number;
  /** Tokens the `ToolCall` block contributes. */
  readonly callTokens: number;
  /** Ceiling of what dropping the pair saves: `resultTokens + callTokens`. */
  readonly tokensEst: number;
  readonly eligibility: PruningEligibility;
}

/** Partition of the masked context into protected tail and candidate pool. */
export interface CoolingWindowPartition {
  /**
   * Index of the first protected message. Every message before it is
   * evaluable; `messages.length` means nothing is prunable.
   */
  readonly protectedStartIndex: number;
  /** Tokens of the protected tail. */
  readonly protectedTokens: number;
  /** The Living Candidate Pool, in chronology order. */
  readonly candidates: readonly PruningCandidate[];
  /** Sum of `PruningCandidate.tokensEst` (what an Epoch could reclaim). */
  readonly candidateTokens: number;
}

/** Inputs of the partition; `messages` must already carry every active mask. */
export interface CoolingWindowOptions {
  /** Defaults to the spec's parameter table. */
  config?: ToolPruningConfig;
  /** Drops already persisted on the active branch; they are terminal there. */
  masks?: ToolPruningMaskMap;
}

/**
 * Partitions the masked context into the Cooling Window and the Living
 * Candidate Pool (spec D4).
 *
 * Protected tail, as a union:
 * 1. The last `coolingRecentTokens` tokens **and** at least the last
 *    `minCoolingToolCalls` paired calls.
 * 2. The active Turn (from its last `UserMessage`), capped at
 *    `maxProtectedTurnTokens`.
 * 3. The most recent completed Turn that used at least one tool, skipping
 *    prose-only Turns in between, capped the same way. A Turn above the cap
 *    keeps only its most recent `maxProtectedTurnTokens / 2` tokens (20 000 by
 *    default) and the excess prefix becomes evaluable.
 *
 * Candidates are paired calls whose result sits before the protected tail,
 * that carry no mask yet and whose eligibility allows at least one drop. An
 * in-flight or aborted call has no paired result and is therefore excluded.
 */
export function partitionCoolingWindow(
  messages: readonly AgentMessage[],
  options: CoolingWindowOptions = {},
): CoolingWindowPartition {
  const config = options.config ?? DEFAULT_TOOL_PRUNING_CONFIG;
  const masks = options.masks ?? {};

  if (messages.length === 0) {
    return {
      protectedStartIndex: 0,
      protectedTokens: 0,
      candidates: [],
      candidateTokens: 0,
    };
  }

  const tokens = messages.map(estimateMessageTokens);
  const paired = collectPairedCalls(messages);

  let protectedStartIndex = findProtectedTailStart(messages, tokens, paired, config);
  const activeTurnStart = findCurrentTurnStart(messages);
  if (activeTurnStart !== undefined) {
    protectedStartIndex = Math.min(
      protectedStartIndex,
      capProtectedTurnStart(
        activeTurnStart,
        messages.length,
        tokens,
        config.maxProtectedTurnTokens,
      ),
    );
  }
  const lastToolTurnStart = findLastCompletedToolTurnStart(messages, tokens, paired, config);
  if (lastToolTurnStart !== undefined) {
    protectedStartIndex = Math.min(protectedStartIndex, lastToolTurnStart);
  }

  let protectedTokens = 0;
  for (let i = protectedStartIndex; i < messages.length; i++) {
    protectedTokens += tokens[i];
  }

  const candidates: PruningCandidate[] = [];
  let candidateTokens = 0;
  for (const call of paired) {
    if (call.assistantIndex >= protectedStartIndex) continue;
    if (call.resultIndex >= protectedStartIndex) continue;
    // `drop_result` and `drop_call` are terminal on the active branch: a masked
    // call is never re-evaluated, so a later Epoch cannot invalidate an earlier
    // cached prefix for a negligible extra saving.
    if (masks[call.toolCallId] !== undefined) continue;

    const text = toolResultText(call.result);
    const eligibility = pruningEligibilityFor(
      {
        toolName: call.result.toolName,
        isError: call.result.isError,
        chars: text.length,
        hasImages: call.result.content.some((block) => block.type === "image"),
      },
      config,
    );
    if (!eligibility.dropResult && !eligibility.dropCall) continue;

    const resultTokens = tokens[call.resultIndex];
    const callTokens = estimateToolCallTokens(call.block);
    const tokensEst = resultTokens + callTokens;
    candidateTokens += tokensEst;
    candidates.push({
      toolCallId: call.toolCallId,
      toolName: call.result.toolName,
      assistantIndex: call.assistantIndex,
      resultIndex: call.resultIndex,
      isError: call.result.isError,
      chars: text.length,
      resultTokens,
      callTokens,
      tokensEst,
      eligibility,
    });
  }

  return {
    protectedStartIndex,
    protectedTokens,
    candidates,
    candidateTokens,
  };
}

/** Tokens of one message, using Pi's conservative chars/4 heuristic. */
export function estimateMessageTokens(message: AgentMessage): number {
  return estimateTokens(message);
}

/** Tokens of a message span, using Pi's conservative chars/4 heuristic. */
export function estimateMessagesTokens(messages: readonly AgentMessage[]): number {
  let total = 0;
  for (const message of messages) total += estimateTokens(message);
  return total;
}

/** A paired call together with the indices of both of its messages. */
interface PairedCall {
  toolCallId: string;
  block: ToolCall;
  result: ToolResultMessage;
  assistantIndex: number;
  resultIndex: number;
}

/**
 * Collects calls that have a paired result in the same projection, in
 * chronology order. Unpaired calls (in flight or aborted) and orphan results
 * are dropped: pruning them would break the provider pairing invariant.
 */
function collectPairedCalls(messages: readonly AgentMessage[]): PairedCall[] {
  const calls = new Map<string, { block: ToolCall; assistantIndex: number }>();
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    for (const block of message.content) {
      if (block.type !== "toolCall") continue;
      // First occurrence wins; duplicated ids cannot occur in a valid branch.
      if (!calls.has(block.id)) calls.set(block.id, { block, assistantIndex: i });
    }
  }

  const paired: PairedCall[] = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (message.role !== "toolResult") continue;
    const call = calls.get(message.toolCallId);
    if (call === undefined) continue;
    // One result per call: a repeated result for the same id is an orphan.
    calls.delete(message.toolCallId);
    paired.push({
      toolCallId: message.toolCallId,
      block: call.block,
      result: message,
      assistantIndex: call.assistantIndex,
      resultIndex: i,
    });
  }
  return paired;
}

/** Index of the `UserMessage` that opened the active turn, if any. */
function findCurrentTurnStart(messages: readonly AgentMessage[]): number | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return i;
  }
  return undefined;
}

/**
 * First index of the always-protected recent tail: walking backwards, the
 * window must cover `coolingRecentTokens` tokens **and**
 * `minCoolingToolCalls` paired calls. When the history is shorter than either
 * minimum it protects everything.
 */
function findProtectedTailStart(
  messages: readonly AgentMessage[],
  tokens: readonly number[],
  paired: readonly PairedCall[],
  config: ToolPruningConfig,
): number {
  const minTokens = Math.max(0, Math.trunc(config.coolingRecentTokens));
  const minCalls = Math.max(0, Math.trunc(config.minCoolingToolCalls));

  const callsByResultIndex = new Map<number, number>();
  for (const call of paired) {
    callsByResultIndex.set(call.resultIndex, (callsByResultIndex.get(call.resultIndex) ?? 0) + 1);
  }

  let tokensInTail = 0;
  let callsInTail = 0;
  let start = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    start = i;
    tokensInTail += tokens[i];
    callsInTail += callsByResultIndex.get(i) ?? 0;
    if (tokensInTail >= minTokens && callsInTail >= minCalls) break;
  }
  return start;
}

/**
 * First protected index granted by rule (c): the most recent completed Turn
 * that used at least one tool, skipping prose-only Turns in between so a
 * conversational Turn cannot prematurely unprotect the files of the plan it
 * discusses.
 *
 * The active Turn (opened by the last `UserMessage`) is handled by its own rule;
 * only Turns that closed before it are considered here.
 */
function findLastCompletedToolTurnStart(
  messages: readonly AgentMessage[],
  tokens: readonly number[],
  paired: readonly PairedCall[],
  config: ToolPruningConfig,
): number | undefined {
  const turnStarts: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === "user") turnStarts.push(i);
  }
  if (turnStarts.length < 2) return undefined;

  for (let turn = turnStarts.length - 2; turn >= 0; turn--) {
    const start = turnStarts[turn];
    const end = turnStarts[turn + 1];
    const usedTools = paired.some(
      (call) => call.resultIndex >= start && call.resultIndex < end,
    );
    if (!usedTools) continue;
    return capProtectedTurnStart(start, end, tokens, config.maxProtectedTurnTokens);
  }
  return undefined;
}

/**
 * Applies the protection cap to one Turn, active or completed. A Turn within the
 * cap is protected in full; a larger one keeps only its most recent half-cap
 * (`maxProtectedTurnTokens / 2`, 20 000 tokens by default) so its excess prefix
 * becomes evaluable and one giant Turn or Subagent cannot protect its obsolete
 * first half forever.
 */
function capProtectedTurnStart(
  start: number,
  end: number,
  tokens: readonly number[],
  maxTurnTokens: number,
): number {
  let turnTokens = 0;
  for (let i = start; i < end; i++) turnTokens += tokens[i];
  if (turnTokens <= maxTurnTokens) return start;

  const retainedBudget = Math.trunc(Math.max(0, maxTurnTokens) / 2);
  if (retainedBudget <= 0) return end;

  let retained = 0;
  let protectedStart = end;
  for (let i = end - 1; i >= start; i--) {
    retained += tokens[i];
    protectedStart = i;
    if (retained >= retainedBudget) break;
  }
  return protectedStart;
}

/** Tokens a `ToolCall` block contributes, mirroring Pi's `estimateTokens`. */
function estimateToolCallTokens(call: ToolCall): number {
  return Math.ceil((call.name.length + JSON.stringify(call.arguments).length) / 4);
}
