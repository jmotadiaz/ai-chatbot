/**
 * Phase 0 of the hybrid decision engine: deterministic supersession and
 * structural annotation (spec D5 Phase 0).
 *
 * This pass is network-free and takes well under a millisecond: it reads the
 * message sequence that is already in memory and decides, without a judge,
 * which `read` results are provably obsolete because a later successful call
 * refreshed the very same file. Two things come out of it:
 *
 * 1. Automatic drops for the Living Candidate Pool (`drop_call` for a pure
 *    duplicate read, `drop_result` when the file was mutated in between, so the
 *    "read X → wrote X" trace survives while the stale body goes away).
 * 2. Structural signals for the candidates Phase 1 still has to judge
 *    (`editedLater`, `sameCommandRanLater`, `laterCommandSucceeded`), which the
 *    decision state uses to give the judge evidence it could not derive from a
 *    head + tail preview alone.
 *
 * Evidence is taken from the whole masked sequence, including the Cooling
 * Window, but only candidates outside the Cooling Window are mutated: the tail
 * is what the agent is working with right now. Requests from protected calls
 * are still the best proof that an older read has been superseded.
 *
 * Phase 0 never decides whether Phase 1 runs. It reports what it reclaimed
 * (`droppedTokens`) and what is left in the pool (`remainingTokens`); the
 * Epoch runner (spec D5 Phase 0.3) combines those numbers with the active
 * token count via `isJudgeWorthwhile`.
 *
 * Everything here is pure and dependency-light, mirroring `mask.ts` and
 * `cooling-window.ts`: Pi loads the extension through jiti in its own module
 * runtime, so this module must never import worker `src/` code. The only
 * dependency is Node's `path`, used to normalise tool paths against the cwd.
 */
import path from "node:path";
import {
  DEFAULT_TOOL_PRUNING_CONFIG,
  NO_TOOL_PRUNING_SIGNALS,
  type AgentMessage,
  type ToolPruningConfig,
  type ToolPruningDrop,
  type ToolPruningMaskMap,
  type ToolPruningSignals,
} from "./config";
import type { PruningCandidate } from "./cooling-window";
import {
  callArguments,
  indexToolCalls,
  numberArgument,
  stringArgument,
} from "./messages";

/** A candidate Phase 0 left for the judge, with its structural signals. */
export interface SupersessionCandidate {
  readonly candidate: PruningCandidate;
  readonly signals: ToolPruningSignals;
}

/** What Phase 0 decided and what it leaves to Phase 1. */
export interface SupersessionResult {
  /** Automatic drops, keyed by `toolCallId`. Empty when nothing is provable. */
  readonly decisions: ToolPruningMaskMap;
  /** Candidates nothing could be proven about, in chronology order. */
  readonly remaining: readonly SupersessionCandidate[];
  /** Number of automatic drops (feeds `stats.deterministicDrops`). */
  readonly droppedCount: number;
  /** Tokens the automatic drops reclaim from the masked context. */
  readonly droppedTokens: number;
  /** Tokens still in the Living Pool; the judge's potential saving. */
  readonly remainingTokens: number;
}

/** Inputs of the deterministic pass. */
export interface SupersessionOptions {
  /**
   * Working directory the agent's relative tool paths are resolved against
   * (`ctx.cwd`). Passing an empty string keeps paths as written, which only
   * matters in tests that do not model a repository.
   */
  cwd: string;
  /** Defaults to the spec's parameter table. */
  config?: ToolPruningConfig;
}

/**
 * Runs Phase 0 over the masked message sequence.
 *
 * `messages` must already carry every mask persisted on the active branch (the
 * runner projects first, exactly as for `partitionCoolingWindow`), and
 * `candidates` must be that partition's Living Candidate Pool. Neither is
 * mutated.
 */
export function runSupersession(
  messages: readonly AgentMessage[],
  candidates: readonly PruningCandidate[],
  options: SupersessionOptions,
): SupersessionResult {
  const config = options.config ?? DEFAULT_TOOL_PRUNING_CONFIG;
  if (candidates.length === 0) {
    return {
      decisions: {},
      remaining: [],
      droppedCount: 0,
      droppedTokens: 0,
      remainingTokens: 0,
    };
  }

  const timeline = collectEvidence(messages, options.cwd);
  const calls = indexToolCalls(messages);

  const decisions: Record<string, ToolPruningDrop> = {};
  const remaining: SupersessionCandidate[] = [];
  let droppedCount = 0;
  let droppedTokens = 0;
  let remainingTokens = 0;

  for (const candidate of candidates) {
    const args = callArguments(calls.get(candidate.toolCallId));
    const drop = deterministicDrop(candidate, args, timeline, config, options.cwd);

    if (drop !== undefined) {
      decisions[candidate.toolCallId] = drop;
      droppedCount += 1;
      // `drop_result` keeps the call block and its stubbed trace: only the
      // result body (plus whatever the stub costs) is reclaimed.
      droppedTokens += drop === "drop_call" ? candidate.tokensEst : candidate.resultTokens;
      continue;
    }

    remaining.push({
      candidate,
      signals: structuralSignals(candidate, args, timeline, options.cwd),
    });
    remainingTokens += candidate.tokensEst;
  }

  return {
    decisions,
    remaining,
    droppedCount,
    droppedTokens,
    remainingTokens,
  };
}

/**
 * Whether the judge is worth a network round-trip after Phase 0 (spec D5
 * Phase 0.3).
 *
 * The Epoch runner owns the decision and the order of its checks: this is only
 * the predicate. A turn-start Epoch whose context is comfortably below the
 * `30 %` line, or whose pool shrank below `minJudgeWorthwhileTokens`, finished
 * in Phase 0 and must not pay latency nor invalidate the KV-cache prefix.
 */
export function isJudgeWorthwhile(input: {
  /** Active context tokens after the Phase 0 drops are applied. */
  activeTokens: number;
  /** `ctx.model.contextWindow`. */
  contextWindow: number;
  /** `SupersessionResult.remainingTokens`. */
  remainingCandidateTokens: number;
  config?: ToolPruningConfig;
}): boolean {
  const config = input.config ?? DEFAULT_TOOL_PRUNING_CONFIG;
  if (input.remainingCandidateTokens < config.minJudgeWorthwhileTokens) return false;
  return input.activeTokens > JUDGE_SHORT_CIRCUIT_RATIO * input.contextWindow;
}

/** Fraction of `contextWindow` below which Phase 1 is skipped (spec D5 P0.3). */
const JUDGE_SHORT_CIRCUIT_RATIO = 0.3;

/**
 * Normalises a tool path against the agent's working directory.
 *
 * Tool calls mix `src/a.ts`, `./src/a.ts` and `/abs/repo/src/a.ts`; all three
 * must compare equal for supersession to work. With an empty `cwd` the path is
 * only normalised, so the function never reaches for ambient process state.
 */
export function normalizePath(rawPath: string, cwd: string): string {
  if (cwd.length === 0) return path.normalize(rawPath);
  return path.resolve(cwd, rawPath);
}

/**
 * Normalises a `bash` command so that re-runs of the same command compare
 * equal: whitespace is collapsed, a leading `cd <dir> &&` is dropped (the same
 * command from another directory is the same command) and trailing no-op
 * plumbing (`2>&1`, `> /dev/null`, `|| true`, `;`) is stripped.
 *
 * An empty result means the command carried no comparable identity.
 */
export function normalizeCommand(rawCommand: string): string {
  let command = rawCommand.trim().replace(/\s+/g, " ");
  command = command.replace(/^(?:cd\s+[^&;|]+?\s*(?:&&|;)\s*)+/, "").trim();

  const suffixes = [
    /\s*2>&1$/,
    /\s*1?>>?\s*\/dev\/null$/,
    /\s*\|\|\s*(?:true|:)$/,
    /\s*&&$/,
    /\s*;$/,
  ];
  // The stripping loop is idempotent after a couple of rounds; the guard only
  // makes sure a pathological suffix can never spin.
  for (let guard = 0; guard < 8; guard++) {
    let next = command;
    for (const suffix of suffixes) next = next.replace(suffix, "");
    next = next.trim();
    if (next === command) break;
    command = next;
  }
  return command;
}

/** A line range a `read` asked for; both ends are inclusive, 1-indexed lines. */
interface ReadRange {
  readonly start: number;
  readonly end: number;
  /** A full read (`offset` and `limit` both absent) refreshes the whole file. */
  readonly isFull: boolean;
}

/** One successful-or-not call on a file, as supersession evidence. */
type PathEvent =
  | {
      readonly kind: "read";
      readonly index: number;
      readonly ok: boolean;
      readonly range: ReadRange;
    }
  | { readonly kind: "write"; readonly index: number; readonly ok: boolean }
  | { readonly kind: "edit"; readonly index: number; readonly ok: boolean };

/** One `bash` run, as command-rerun evidence. */
interface CommandEvent {
  readonly index: number;
  readonly ok: boolean;
}

/**
 * Evidence index over the whole message sequence. `index` is the position of
 * the `ToolResultMessage`, so `index` order is completion order and therefore
 * chronology.
 */
interface EvidenceTimeline {
  readonly byPath: ReadonlyMap<string, readonly PathEvent[]>;
  readonly byCommand: ReadonlyMap<string, readonly CommandEvent[]>;
}

/**
 * The supersession rule for one candidate, or `undefined` when nothing can be
 * proven without the judge.
 *
 * Every rule is gated by the candidate's eligibility: a result too short to
 * benefit from the head + tail stub simply stays, and a rule that wanted to
 * preserve the trace (`drop_result`) never silently escalates into removing the
 * call itself.
 */
function deterministicDrop(
  candidate: PruningCandidate,
  args: Record<string, unknown> | undefined,
  timeline: EvidenceTimeline,
  config: ToolPruningConfig,
  cwd: string,
): ToolPruningDrop | undefined {
  if (candidate.toolName !== "read" || args === undefined) return undefined;
  const rawPath = stringArgument(args, "path");
  if (rawPath === undefined) return undefined;

  const events = timeline.byPath.get(normalizePath(rawPath, cwd)) ?? [];
  if (events.length === 0) return undefined;
  // Only calls that completed after this result can supersede it.
  const later = events.filter((event) => event.index > candidate.resultIndex);
  if (later.length === 0) return undefined;

  const range = readRange(args);

  // A failed read is remembered so the agent does not retry it; only a bulky
  // log may lose its body once the same path was read or written successfully.
  if (candidate.isError) {
    if (candidate.chars <= config.errorTruncateMinChars) return undefined;
    const refreshed = later.some(
      (event) => event.ok && (event.kind === "read" || event.kind === "write"),
    );
    return refreshed ? resolveDrop("drop_result", candidate) : undefined;
  }

  if (range.isFull) {
    // Full read: the earliest later call that re-reads the whole file or
    // overwrites it is the point where this body went stale.
    const refresh = later.find(
      (event) =>
        event.ok &&
        (event.kind === "write" || (event.kind === "read" && event.range.isFull)),
    );
    if (refresh === undefined) return undefined;
    if (refresh.kind === "write") return resolveDrop("drop_result", candidate);

    // A later read with no mutation in between is a pure duplicate: the trace
    // "read X → read X" teaches nothing. With an `edit` or `write` in between,
    // "read X → modified X → read X" is the working state and stays visible.
    const mutatedBetween = later.some(
      (event) =>
        event.ok &&
        event.index < refresh.index &&
        (event.kind === "edit" || event.kind === "write"),
    );
    return resolveDrop(mutatedBetween ? "drop_result" : "drop_call", candidate);
  }

  // Ranged read: superseded by an overwrite or by a later read whose range
  // covers it entirely. Partial coverage leaves the missing lines unknown.
  const overwritten = later.some((event) => event.ok && event.kind === "write");
  if (overwritten) return resolveDrop("drop_result", candidate);
  const covered = later.some(
    (event) => event.ok && event.kind === "read" && coversRange(event.range, range),
  );
  return covered ? resolveDrop("drop_result", candidate) : undefined;
}

/** Structural signals for one candidate Phase 1 still has to judge. */
function structuralSignals(
  candidate: PruningCandidate,
  args: Record<string, unknown> | undefined,
  timeline: EvidenceTimeline,
  cwd: string,
): ToolPruningSignals {
  if (args === undefined) return NO_TOOL_PRUNING_SIGNALS;

  if (candidate.toolName === "read") {
    const rawPath = stringArgument(args, "path");
    if (rawPath === undefined) return NO_TOOL_PRUNING_SIGNALS;
    const events = timeline.byPath.get(normalizePath(rawPath, cwd)) ?? [];
    const editedLater = events.some(
      (event) => event.ok && event.kind === "edit" && event.index > candidate.resultIndex,
    );
    return editedLater ? { ...NO_TOOL_PRUNING_SIGNALS, editedLater: true } : NO_TOOL_PRUNING_SIGNALS;
  }

  if (candidate.toolName === "bash") {
    const rawCommand = stringArgument(args, "command");
    if (rawCommand === undefined) return NO_TOOL_PRUNING_SIGNALS;
    const command = normalizeCommand(rawCommand);
    if (command.length === 0) return NO_TOOL_PRUNING_SIGNALS;
    const later = (timeline.byCommand.get(command) ?? []).filter(
      (event) => event.index > candidate.resultIndex,
    );
    if (later.length === 0) return NO_TOOL_PRUNING_SIGNALS;
    return {
      editedLater: false,
      sameCommandRanLater: true,
      laterCommandSucceeded: later.some((event) => event.ok),
    };
  }

  return NO_TOOL_PRUNING_SIGNALS;
}

/**
 * Applies the per-tool eligibility to a Phase 0 verdict.
 *
 * `drop_result` needs a body worth stubbing; when the result is too short the
 * call and its result simply stay. `drop_call` may fall back to `drop_result`
 * (same saving, less information lost) but never the other way round.
 */
function resolveDrop(
  preferred: ToolPruningDrop,
  candidate: PruningCandidate,
): ToolPruningDrop | undefined {
  const { eligibility } = candidate;
  if (preferred === "drop_result") {
    return eligibility.dropResult ? "drop_result" : undefined;
  }
  if (eligibility.dropCall) return "drop_call";
  return eligibility.dropResult ? "drop_result" : undefined;
}

/** Whether `outer` covers every line `inner` asked for (both ranges inclusive). */
function coversRange(outer: ReadRange, inner: ReadRange): boolean {
  return outer.start <= inner.start && outer.end >= inner.end;
}

/**
 * Line range a `read` asked for, in Pi's 1-indexed, inclusive line numbering.
 *
 * Absent `offset` and `limit` mean the whole file. Pi's `offset` is 1-indexed
 * and `limit` counts lines, so a read that only sets `limit` starts at line 1:
 * defaulting a missing `offset` to 0 would shift every range by one line and
 * make a `[1, limit]` read look like `[0, limit - 1]`, which the full read
 * `[1, ∞)` would then only seem to cover by accident (spec D5 Phase 0.1).
 *
 * A read with only one of the two arguments is ranged, never a full read, so it
 * can never claim to cover one.
 */
function readRange(args: Record<string, unknown>): ReadRange {
  const offset = numberArgument(args, "offset");
  const limit = numberArgument(args, "limit");
  if (offset === undefined && limit === undefined) {
    return { start: 1, end: Number.POSITIVE_INFINITY, isFull: true };
  }
  const start = offset ?? 1;
  const end = limit === undefined ? Number.POSITIVE_INFINITY : start + Math.max(0, limit) - 1;
  return { start, end, isFull: false };
}

/**
 * Builds the evidence index from the full message sequence.
 *
 * Only paired calls become evidence (an in-flight or aborted call has no
 * outcome), and only calls whose target can be read: a `read` without a usable
 * `path` carries no identity to compare.
 */
function collectEvidence(messages: readonly AgentMessage[], cwd: string): EvidenceTimeline {
  const calls = indexToolCalls(messages);
  const byPath = new Map<string, PathEvent[]>();
  const byCommand = new Map<string, CommandEvent[]>();

  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (message.role !== "toolResult") continue;
    const call = calls.get(message.toolCallId);
    if (call === undefined) continue;
    const args = callArguments(call);
    if (args === undefined) continue;
    const ok = !message.isError;

    const rawPath = stringArgument(args, "path");
    if (rawPath !== undefined) {
      const key = normalizePath(rawPath, cwd);
      const events = byPath.get(key) ?? [];
      if (message.toolName === "read") {
        events.push({ kind: "read", index, ok, range: readRange(args) });
      } else if (message.toolName === "write") {
        events.push({ kind: "write", index, ok });
      } else if (message.toolName === "edit") {
        events.push({ kind: "edit", index, ok });
      } else {
        continue;
      }
      byPath.set(key, events);
      continue;
    }

    if (message.toolName === "bash") {
      const rawCommand = stringArgument(args, "command");
      if (rawCommand === undefined) continue;
      const command = normalizeCommand(rawCommand);
      if (command.length === 0) continue;
      const events = byCommand.get(command) ?? [];
      events.push({ index, ok });
      byCommand.set(command, events);
    }
  }

  return { byPath, byCommand };
}


