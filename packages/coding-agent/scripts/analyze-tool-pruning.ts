#!/usr/bin/env tsx
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TOOL_PRUNING_ENTRY_TYPE,
  type ToolPruningCandidateAudit,
  type ToolPruningDrop,
  type ToolPruningEpochEntry,
} from "../src/pruning/config";
import { normalizeCommand, normalizePath } from "../src/pruning/supersession";

/**
 * Post-hoc analyzer for Tool Pruning across coding-agent session transcripts.
 *
 * Answers the empirical calibration questions after days of real use:
 * 1. **Cadence & Watermark coverage:** how many sessions triggered 0.45 / 0.60 /
 *    0.75, how many tokens were saved before Pi's native Compaction, and how
 *    often `/v1/systemone` failed open or short-circuited in Phase 0.
 * 2. **Phase 0 vs Phase 1 yield & cost:** deterministic drops vs judge drops,
 *    latency (median / p90 / max) and total `/v1/systemone` cost.
 * 3. **Calibrated `noul` score distribution:** histogram of `keepResult` and
 *    `keepCall` across `[0, 0.15)`, `[0.15, 0.25)`, `[0.25, 0.40)`,
 *    `[0.40, 0.60)`, `[0.60, 1.0]` so threshold adjustments (`0.25` / `0.15`)
 *    are backed by real data.
 * 4. **Regret detection (False Positives):** pruned `read`/`grep`/`find`/`ls`
 *    or `bash` calls where the agent re-read the exact same path or re-ran the
 *    exact same command on the active branch without an intervening `edit` or
 *    `write` on that path.
 * 5. **Missed drops (False Negatives):** large candidates (`>= 1 000` tokens)
 *    kept by the judge whose target was never read, edited, written or re-run
 *    again in the remainder of the session branch.
 *
 * Reads Pi's session logs (`.pi-<env>/agent/sessions/**\/*.jsonl` or
 * `.pi-<env>/sessions/**\/*.jsonl`, or an explicit `--dir` / `--session`);
 * strictly read-only, safe to run against prod while the worker is live.
 *
 * Usage:
 *   pnpm --filter coding-agent analyze:pruning
 *   pnpm --filter coding-agent analyze:pruning -- --since 2026-11-01 --env all
 *   pnpm --filter coding-agent analyze:pruning -- --session <sessionId-or-path>
 *   pnpm --filter coding-agent analyze:pruning -- --json
 */

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface AnalyzePruningOptions {
  since: string;
  env: "prod" | "dev" | "test" | "all";
  session?: string;
  dir?: string;
  json: boolean;
}

export interface RegretIncident {
  readonly sessionId: string;
  readonly env: string;
  readonly epochId: number;
  readonly watermark: number;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly target: string;
  readonly decision: ToolPruningDrop;
  readonly source: "phase0" | "judge" | "leftover" | "unknown";
  readonly keepResult?: number;
  readonly keepCall?: number;
  readonly turnsUntilRepeat: number;
}

export interface MissedDropIncident {
  readonly sessionId: string;
  readonly env: string;
  readonly epochId: number;
  readonly watermark: number;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly target: string;
  readonly tokensEst: number;
  readonly keepResult?: number;
  readonly keepCall?: number;
}

export interface NoulHistogram {
  readonly "[0.00, 0.15)": number;
  readonly "[0.15, 0.25)": number;
  readonly "[0.25, 0.40)": number;
  readonly "[0.40, 0.60)": number;
  readonly "[0.60, 1.00]": number;
}

export interface SessionPruningSummary {
  readonly sessionId: string;
  readonly file: string;
  readonly env: string;
  readonly start: string;
  readonly model: string | null;
  readonly subagent: boolean;
  readonly turns: number;
  readonly toolCalls: number;
  readonly compactions: number;
  readonly epochs: number;
  readonly watermarksReached: readonly number[];
  readonly tokensSavedEst: number;
  readonly deterministicDrops: number;
  readonly judgeDrops: number;
  readonly candidatesEvaluated: number;
  readonly failedOpenEpochs: number;
  readonly shortCircuitedEpochs: number;
  readonly totalLatencyMs: number;
  readonly totalCost: number;
  readonly regrets: readonly RegretIncident[];
  readonly missedDrops: readonly MissedDropIncident[];
}

export interface AggregatePruningReport {
  readonly window: {
    readonly since: string;
    readonly env: string;
    readonly sessionFilter?: string;
  };
  readonly totals: {
    readonly sessions: number;
    readonly sessionsWithPruning: number;
    readonly sessionsWithCompaction: number;
    readonly epochs: number;
    readonly shortCircuitedEpochs: number;
    readonly failedOpenEpochs: number;
    readonly watermarkCounts: Readonly<Record<string, number>>;
    readonly candidatesEvaluated: number;
    readonly deterministicDrops: number;
    readonly judgeDrops: number;
    readonly tokensSavedEst: number;
    readonly totalCost: number;
    readonly latencyMs: {
      readonly median: number;
      readonly p90: number;
      readonly max: number;
    };
    readonly keepResultHistogram: NoulHistogram;
    readonly keepCallHistogram: NoulHistogram;
    readonly regretCount: number;
    readonly judgeRegretCount: number;
    readonly missedDropCount: number;
  };
  readonly regrets: readonly RegretIncident[];
  readonly missedDrops: readonly MissedDropIncident[];
  readonly sessions: readonly SessionPruningSummary[];
}

interface RawSessionNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly index: number;
  readonly record: Record<string, unknown>;
}

interface TimelineCallEvent {
  readonly entryIndex: number;
  readonly turnIndex: number;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly target: string | undefined;
  readonly isMutation: boolean;
  readonly isError: boolean;
}

const MIN_MISSED_DROP_TOKENS = 1_000;

export function parseArgs(argv: string[]): AnalyzePruningOptions {
  const options: AnalyzePruningOptions = {
    since: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    env: "all",
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    else if (arg === "--json") options.json = true;
    else if (arg === "--since") options.since = requireValue(argv, ++i, "--since");
    else if (arg.startsWith("--since=")) options.since = arg.slice("--since=".length);
    else if (arg === "--env") options.env = parseEnv(requireValue(argv, ++i, "--env"));
    else if (arg.startsWith("--env=")) options.env = parseEnv(arg.slice("--env=".length));
    else if (arg === "--session") options.session = requireValue(argv, ++i, "--session");
    else if (arg.startsWith("--session=")) options.session = arg.slice("--session=".length);
    else if (arg === "--dir") options.dir = requireValue(argv, ++i, "--dir");
    else if (arg.startsWith("--dir=")) options.dir = arg.slice("--dir=".length);
    else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parseEnv(value: string): AnalyzePruningOptions["env"] {
  if (value === "prod" || value === "dev" || value === "test" || value === "all") return value;
  throw new Error(`--env must be prod, dev, test or all (got "${value}")`);
}

function printUsage(): void {
  console.log(
    [
      "Usage: analyze-tool-pruning [--since YYYY-MM-DD] [--env prod|dev|test|all] [--session <id|path>] [--dir <path>] [--json]",
      "",
      "Defaults: --since 14 days ago, --env all.",
      "Reads Pi session .jsonl transcripts; strictly read-only.",
    ].join("\n"),
  );
}

function discoverSessionFiles(options: AnalyzePruningOptions): { env: string; file: string }[] {
  if (options.session && existsSync(options.session) && options.session.endsWith(".jsonl")) {
    return [{ env: "custom", file: path.resolve(options.session) }];
  }
  if (options.dir) {
    const resolved = path.resolve(options.dir);
    return walkJsonlFiles(resolved).map((file) => ({ env: "custom", file }));
  }

  const envs = options.env === "all" ? ["prod", "dev", "test"] : [options.env];
  const found: { env: string; file: string }[] = [];
  const seen = new Set<string>();

  for (const env of envs) {
    const candidates = [
      path.join(PACKAGE_ROOT, `.pi-${env}`, "agent", "sessions"),
      path.join(PACKAGE_ROOT, `.pi-${env}`, "sessions"),
    ];
    if (env === "prod") {
      candidates.push(path.join(PACKAGE_ROOT, ".pi", "agent", "sessions"));
      candidates.push(path.join(PACKAGE_ROOT, ".pi", "sessions"));
    }
    for (const root of candidates) {
      if (!existsSync(root)) continue;
      for (const file of walkJsonlFiles(root)) {
        const real = path.resolve(file);
        if (seen.has(real)) continue;
        seen.add(real);
        if (options.session && !file.includes(options.session)) continue;
        found.push({ env, file: real });
      }
    }
  }
  return found.sort((a, b) => a.file.localeCompare(b.file));
}

function walkJsonlFiles(root: string): string[] {
  const results: string[] = [];
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkJsonlFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Parses a session `.jsonl` file and reconstructs its active branch (from root
 * to the latest leaf), matching `ctx.sessionManager.getBranch()` so entries on
 * abandoned Message Edit branches are excluded from active metrics.
 */
export function analyzeSessionFile(
  file: string,
  env: string,
): {
  summary: SessionPruningSummary;
  epochLatencies: number[];
  keepResultScores: number[];
  keepCallScores: number[];
} | null {
  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    return null;
  }

  let sessionId = path.basename(file, ".jsonl");
  let start = "";
  let cwd = "";
  let model: string | null = null;
  const nodes: RawSessionNode[] = [];

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }

    if (record.type === "session") {
      if (typeof record.id === "string" && record.id.length > 0) sessionId = record.id;
      if (typeof record.timestamp === "string") start = record.timestamp;
      if (typeof record.cwd === "string") cwd = record.cwd;
      continue;
    }
    if (record.type === "model_change" && typeof record.modelId === "string") {
      model = record.modelId;
    }

    const id = typeof record.id === "string" ? record.id : `idx-${i}`;
    const parentId = typeof record.parentId === "string" ? record.parentId : null;
    nodes.push({ id, parentId, index: nodes.length, record });
  }

  if (!start && nodes.length === 0) return null;

  const branch = activeBranchOf(nodes);
  const callMetaById = new Map<
    string,
    { toolName: string; target: string | undefined; args: Record<string, unknown> }
  >();
  const callEvents: TimelineCallEvent[] = [];
  const epochs: { entryIndex: number; turnIndex: number; entry: ToolPruningEpochEntry }[] = [];

  let turns = 0;
  let compactions = 0;

  for (let idx = 0; idx < branch.length; idx++) {
    const record = branch[idx].record;
    const type = record.type;

    if (type === "compaction") {
      compactions += 1;
      continue;
    }

    if (type === "custom" && record.customType === TOOL_PRUNING_ENTRY_TYPE) {
      const parsed = parseEpochEntry(record.data);
      if (parsed) {
        epochs.push({ entryIndex: idx, turnIndex: turns, entry: parsed });
      }
      continue;
    }

    if (type !== "message" || !isRecord(record.message)) continue;
    const message = record.message;
    const role = message.role;

    if (role === "user") {
      turns += 1;
      continue;
    }

    if (role === "assistant" && Array.isArray(message.content)) {
      for (const block of message.content) {
        if (!isRecord(block) || block.type !== "toolCall") continue;
        const toolCallId = typeof block.id === "string" ? block.id : "";
        const toolName = typeof block.name === "string" ? block.name : "";
        const args = isRecord(block.arguments) ? block.arguments : {};
        if (!toolCallId || !toolName) continue;
        callMetaById.set(toolCallId, {
          toolName,
          target: normalizeTarget(toolName, args, cwd),
          args,
        });
      }
      continue;
    }

    if (role === "toolResult") {
      const toolCallId = typeof message.toolCallId === "string" ? message.toolCallId : "";
      const meta = callMetaById.get(toolCallId);
      const toolName =
        meta?.toolName ?? (typeof message.toolName === "string" ? message.toolName : "");
      if (!toolCallId || !toolName) continue;
      const isError = message.isError === true;
      callEvents.push({
        entryIndex: idx,
        turnIndex: turns,
        toolCallId,
        toolName,
        target: meta?.target,
        isMutation: toolName === "edit" || toolName === "write",
        isError,
      });
    }
  }

  const callEventById = new Map<string, TimelineCallEvent>();
  for (const event of callEvents) {
    if (!callEventById.has(event.toolCallId)) callEventById.set(event.toolCallId, event);
  }

  const regrets: RegretIncident[] = [];
  const missedDrops: MissedDropIncident[] = [];
  const epochLatencies: number[] = [];
  const keepResultScores: number[] = [];
  const keepCallScores: number[] = [];
  const watermarksReached: number[] = [];

  let tokensSavedEst = 0;
  let deterministicDrops = 0;
  let judgeDrops = 0;
  let candidatesEvaluated = 0;
  let failedOpenEpochs = 0;
  let shortCircuitedEpochs = 0;
  let totalLatencyMs = 0;
  let totalCost = 0;

  for (const { entryIndex, turnIndex, entry } of epochs) {
    if (!watermarksReached.includes(entry.watermark)) {
      watermarksReached.push(entry.watermark);
    }
    tokensSavedEst += entry.tokensSavedEst;
    deterministicDrops += entry.stats.deterministicDrops;
    judgeDrops += entry.stats.judgeDrops;
    candidatesEvaluated += entry.stats.candidatesEvaluated;
    if (entry.stats.failedOpen) failedOpenEpochs += 1;
    if (entry.stats.batches === 0 && !entry.stats.failedOpen) shortCircuitedEpochs += 1;
    totalLatencyMs += entry.stats.latencyMs;
    epochLatencies.push(entry.stats.latencyMs);
    if (typeof entry.stats.cost === "number") totalCost += entry.stats.cost;

    const auditByCallId = new Map<string, ToolPruningCandidateAudit>();
    for (const item of entry.audit ?? []) {
      auditByCallId.set(item.toolCallId, item);
      if (typeof item.keepResult === "number") keepResultScores.push(item.keepResult);
      if (typeof item.keepCall === "number") keepCallScores.push(item.keepCall);
    }

    // 1. Check Regret (False Positives) for every drop in this Epoch.
    for (const [toolCallId, decision] of Object.entries(entry.decisions)) {
      const auditItem = auditByCallId.get(toolCallId);
      const originalEvent = callEventById.get(toolCallId);
      const toolName = auditItem?.toolName ?? originalEvent?.toolName ?? "unknown";
      const target =
        originalEvent?.target ??
        (auditItem?.target ? normalizeRawTarget(toolName, auditItem.target, cwd) : undefined);
      if (!target) continue;

      const laterEvents = callEvents.filter((ev) => ev.entryIndex > entryIndex);
      let mutatedFirst = false;
      for (const later of laterEvents) {
        if (later.target !== target) continue;
        if (later.isMutation && !later.isError) {
          mutatedFirst = true;
          break;
        }
        if (later.toolName === toolName) {
          if (!mutatedFirst) {
            regrets.push({
              sessionId,
              env,
              epochId: entry.epochId,
              watermark: entry.watermark,
              toolCallId,
              toolName,
              target: auditItem?.target ?? target,
              decision,
              source: auditItem?.source ?? "unknown",
              ...(auditItem?.keepResult === undefined ? {} : { keepResult: auditItem.keepResult }),
              ...(auditItem?.keepCall === undefined ? {} : { keepCall: auditItem.keepCall }),
              turnsUntilRepeat: Math.max(0, later.turnIndex - turnIndex),
            });
          }
          break;
        }
      }
    }

    // 2. Check Missed Drops (False Negatives) for large kept judge candidates.
    for (const item of entry.audit ?? []) {
      if (item.decision !== "keep" || item.source !== "judge") continue;
      if (item.tokensEst < MIN_MISSED_DROP_TOKENS) continue;
      const originalEvent = callEventById.get(item.toolCallId);
      const target =
        originalEvent?.target ??
        (item.target ? normalizeRawTarget(item.toolName, item.target, cwd) : undefined);
      if (!target) continue;

      const usedAfterEpoch = callEvents.some(
        (ev) => ev.entryIndex > entryIndex && ev.target === target,
      );
      if (!usedAfterEpoch) {
        missedDrops.push({
          sessionId,
          env,
          epochId: entry.epochId,
          watermark: entry.watermark,
          toolCallId: item.toolCallId,
          toolName: item.toolName,
          target: item.target ?? target,
          tokensEst: item.tokensEst,
          ...(item.keepResult === undefined ? {} : { keepResult: item.keepResult }),
          ...(item.keepCall === undefined ? {} : { keepCall: item.keepCall }),
        });
      }
    }
  }

  return {
    summary: {
      sessionId,
      file,
      env,
      start: start || "unknown",
      model,
      subagent: file.includes("subagents"),
      turns,
      toolCalls: callEvents.length,
      compactions,
      epochs: epochs.length,
      watermarksReached: watermarksReached.sort((a, b) => a - b),
      tokensSavedEst,
      deterministicDrops,
      judgeDrops,
      candidatesEvaluated,
      failedOpenEpochs,
      shortCircuitedEpochs,
      totalLatencyMs,
      totalCost,
      regrets,
      missedDrops,
    },
    epochLatencies,
    keepResultScores,
    keepCallScores,
  };
}

/** Reconstructs the active branch from the last entry backwards by `parentId`. */
function activeBranchOf(nodes: readonly RawSessionNode[]): RawSessionNode[] {
  if (nodes.length === 0) return [];
  const byId = new Map<string, RawSessionNode>();
  for (const node of nodes) byId.set(node.id, node);

  const chain: RawSessionNode[] = [];
  const visited = new Set<string>();
  let current: RawSessionNode | undefined = nodes[nodes.length - 1];
  while (current !== undefined && !visited.has(current.id)) {
    visited.add(current.id);
    chain.push(current);
    current = current.parentId !== null ? byId.get(current.parentId) : undefined;
  }
  chain.reverse();
  // If the file entries carry no parentId links, preserve chronological order.
  return chain.length > 1 || nodes.length <= 1 ? chain : [...nodes];
}

function normalizeTarget(
  toolName: string,
  args: Record<string, unknown>,
  cwd: string,
): string | undefined {
  const rawPath =
    typeof args.path === "string"
      ? args.path
      : typeof args.file_path === "string"
        ? args.file_path
        : undefined;
  if (rawPath && rawPath.length > 0) {
    return normalizePath(rawPath, cwd);
  }
  if (toolName === "bash" && typeof args.command === "string") {
    const cmd = normalizeCommand(args.command);
    return cmd.length > 0 ? cmd : undefined;
  }
  const pattern =
    typeof args.pattern === "string"
      ? args.pattern
      : typeof args.glob === "string"
        ? args.glob
        : undefined;
  return pattern && pattern.length > 0 ? `${toolName}:${pattern}` : undefined;
}

function normalizeRawTarget(toolName: string, rawTarget: string, cwd: string): string {
  if (toolName === "read" || toolName === "edit" || toolName === "write") {
    return normalizePath(rawTarget, cwd);
  }
  if (toolName === "bash") {
    return normalizeCommand(rawTarget) || rawTarget;
  }
  return `${toolName}:${rawTarget}`;
}

function parseEpochEntry(data: unknown): ToolPruningEpochEntry | null {
  if (!isRecord(data) || data.version !== 1 || typeof data.epochId !== "number") return null;
  if (!isRecord(data.decisions) || !isRecord(data.stats)) return null;
  const decisions: Record<string, ToolPruningDrop> = {};
  for (const [k, v] of Object.entries(data.decisions)) {
    if (v === "drop_result" || v === "drop_call") decisions[k] = v;
  }
  const audit = Array.isArray(data.audit)
    ? (data.audit.filter(isRecord) as unknown as ToolPruningCandidateAudit[])
    : undefined;
  return {
    version: 1,
    epochId: data.epochId,
    watermark: typeof data.watermark === "number" ? data.watermark : 0,
    timestamp: typeof data.timestamp === "number" ? data.timestamp : 0,
    tokensBefore: typeof data.tokensBefore === "number" ? data.tokensBefore : 0,
    tokensSavedEst: typeof data.tokensSavedEst === "number" ? data.tokensSavedEst : 0,
    decisions,
    stats: {
      deterministicDrops: Number(data.stats.deterministicDrops ?? 0),
      judgeDrops: Number(data.stats.judgeDrops ?? 0),
      candidatesEvaluated: Number(data.stats.candidatesEvaluated ?? 0),
      batches: Number(data.stats.batches ?? 0),
      latencyMs: Number(data.stats.latencyMs ?? 0),
      ...(typeof data.stats.decisionModel === "string"
        ? { decisionModel: data.stats.decisionModel }
        : {}),
      ...(typeof data.stats.cost === "number" ? { cost: data.stats.cost } : {}),
      ...(data.stats.failedOpen === true ? { failedOpen: true } : {}),
    },
    ...(audit === undefined ? {} : { audit }),
  };
}

function buildHistogram(scores: readonly number[]): NoulHistogram {
  const bins = {
    "[0.00, 0.15)": 0,
    "[0.15, 0.25)": 0,
    "[0.25, 0.40)": 0,
    "[0.40, 0.60)": 0,
    "[0.60, 1.00]": 0,
  };
  for (const score of scores) {
    if (!Number.isFinite(score) || score < 0 || score > 1) continue;
    if (score < 0.15) bins["[0.00, 0.15)"] += 1;
    else if (score < 0.25) bins["[0.15, 0.25)"] += 1;
    else if (score < 0.4) bins["[0.25, 0.40)"] += 1;
    else if (score < 0.6) bins["[0.40, 0.60)"] += 1;
    else bins["[0.60, 1.00]"] += 1;
  }
  return bins;
}

export function buildAggregateReport(
  options: AnalyzePruningOptions,
  analyzed: readonly NonNullable<ReturnType<typeof analyzeSessionFile>>[],
): AggregatePruningReport {
  const summaries = analyzed.map((item) => item.summary);
  const allLatencies = analyzed.flatMap((item) => item.epochLatencies);
  const allKeepResult = analyzed.flatMap((item) => item.keepResultScores);
  const allKeepCall = analyzed.flatMap((item) => item.keepCallScores);
  const regrets = summaries.flatMap((s) => s.regrets);
  const missedDrops = summaries.flatMap((s) => s.missedDrops);

  const watermarkCounts: Record<string, number> = {};
  for (const s of summaries) {
    for (const w of s.watermarksReached) {
      const key = w.toFixed(2);
      watermarkCounts[key] = (watermarkCounts[key] ?? 0) + 1;
    }
  }

  return {
    window: {
      since: options.since,
      env: options.env,
      ...(options.session ? { sessionFilter: options.session } : {}),
    },
    totals: {
      sessions: summaries.length,
      sessionsWithPruning: summaries.filter((s) => s.epochs > 0).length,
      sessionsWithCompaction: summaries.filter((s) => s.compactions > 0).length,
      epochs: summaries.reduce((acc, s) => acc + s.epochs, 0),
      shortCircuitedEpochs: summaries.reduce((acc, s) => acc + s.shortCircuitedEpochs, 0),
      failedOpenEpochs: summaries.reduce((acc, s) => acc + s.failedOpenEpochs, 0),
      watermarkCounts,
      candidatesEvaluated: summaries.reduce((acc, s) => acc + s.candidatesEvaluated, 0),
      deterministicDrops: summaries.reduce((acc, s) => acc + s.deterministicDrops, 0),
      judgeDrops: summaries.reduce((acc, s) => acc + s.judgeDrops, 0),
      tokensSavedEst: summaries.reduce((acc, s) => acc + s.tokensSavedEst, 0),
      totalCost: Number(summaries.reduce((acc, s) => acc + s.totalCost, 0).toFixed(6)),
      latencyMs: {
        median: median(allLatencies),
        p90: percentile(allLatencies, 0.9),
        max: allLatencies.length > 0 ? Math.max(...allLatencies) : 0,
      },
      keepResultHistogram: buildHistogram(allKeepResult),
      keepCallHistogram: buildHistogram(allKeepCall),
      regretCount: regrets.length,
      judgeRegretCount: regrets.filter((r) => r.source === "judge").length,
      missedDropCount: missedDrops.length,
    },
    regrets,
    missedDrops,
    sessions: summaries,
  };
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function pct(part: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((100 * part) / total)}%`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function renderReport(report: AggregatePruningReport): void {
  const { totals } = report;
  console.log(
    `Tool Pruning Report — since ${report.window.since} (env=${report.window.env}${
      report.window.sessionFilter ? `, filter=${report.window.sessionFilter}` : ""
    })`,
  );
  console.log("=".repeat(78));
  console.log(
    `Sessions: ${totals.sessions} total | ${totals.sessionsWithPruning} triggered pruning (${pct(
      totals.sessionsWithPruning,
      totals.sessions,
    )}) | ${totals.sessionsWithCompaction} reached Pi Compaction (${pct(
      totals.sessionsWithCompaction,
      totals.sessions,
    )})`,
  );
  console.log(
    `Epochs:   ${totals.epochs} total | ${totals.shortCircuitedEpochs} Phase-0 short-circuited (0 HTTP) | ${totals.failedOpenEpochs} failed-open`,
  );
  const wmSummary =
    Object.entries(totals.watermarkCounts)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([wm, count]) => `${wm}=${count}`)
      .join("  ") || "none";
  console.log(`Steps:    ${wmSummary}`);
  console.log(
    `Savings:  ${totals.tokensSavedEst.toLocaleString("en-US")} est. tokens saved across ${
      totals.deterministicDrops + totals.judgeDrops
    }/${totals.candidatesEvaluated} dropped candidates (Phase 0: ${
      totals.deterministicDrops
    }, Judge: ${totals.judgeDrops})`,
  );
  console.log(
    `Latency:  median=${totals.latencyMs.median}ms  p90=${totals.latencyMs.p90}ms  max=${
      totals.latencyMs.max
    }ms  cost=$${totals.totalCost.toFixed(5)}`,
  );
  console.log(
    `Quality:  Regrets (re-read/re-run after drop): ${totals.regretCount} (Judge: ${totals.judgeRegretCount}) | Missed large drops (>=1k tok kept & unused): ${totals.missedDropCount}`,
  );

  console.log("\nJudge noul distribution (keepResult):");
  for (const [bucket, count] of Object.entries(totals.keepResultHistogram)) {
    console.log(`  ${bucket}: ${count}`);
  }

  if (report.regrets.length > 0) {
    console.log("\nRegret incidents (pruned target re-executed without intervening edit/write):");
    for (const r of report.regrets.slice(0, 20)) {
      const score = r.keepResult !== undefined ? ` keepResult=${r.keepResult.toFixed(3)}` : "";
      console.log(
        `  [${r.env}] session=${r.sessionId.slice(0, 8)} epoch#${r.epochId}@${r.watermark} ${
          r.toolName
        }(${r.target}) -> ${r.decision} (${r.source}${score}) re-ran +${r.turnsUntilRepeat} turn(s) later`,
      );
    }
  }

  if (report.missedDrops.length > 0) {
    console.log("\nTop missed drops (large candidates kept by judge but never referenced again):");
    const topMissed = [...report.missedDrops]
      .sort((a, b) => b.tokensEst - a.tokensEst)
      .slice(0, 15);
    for (const m of topMissed) {
      const score = m.keepResult !== undefined ? ` keepResult=${m.keepResult.toFixed(3)}` : "";
      console.log(
        `  [${m.env}] session=${m.sessionId.slice(0, 8)} epoch#${m.epochId}@${m.watermark} ${
          m.toolName
        }(${m.target}) ${m.tokensEst} tok${score}`,
      );
    }
  }

  const activeSessions = report.sessions.filter((s) => s.epochs > 0 || s.compactions > 0);
  if (activeSessions.length > 0) {
    console.log("\nSessions with Pruning or Compaction:");
    console.log(
      [
        "start",
        "env",
        "kind",
        "session",
        "turns",
        "calls",
        "epochs",
        "steps",
        "p0Drop",
        "jDrop",
        "savedTok",
        "regret",
        "compact",
      ].join("\t"),
    );
    for (const s of activeSessions) {
      console.log(
        [
          s.start.slice(0, 16),
          s.env,
          s.subagent ? "sub" : "main",
          s.sessionId.slice(0, 8),
          s.turns,
          s.toolCalls,
          s.epochs,
          s.watermarksReached.map((w) => w.toFixed(2)).join(",") || "-",
          s.deterministicDrops,
          s.judgeDrops,
          s.tokensSavedEst,
          s.regrets.length,
          s.compactions,
        ].join("\t"),
      );
    }
  }
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const options = parseArgs(process.argv.slice(2));
  const files = discoverSessionFiles(options);
  const analyzed = files
    .map(({ env, file }) => analyzeSessionFile(file, env))
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .filter(
      (item) =>
        Boolean(options.session) ||
        item.summary.start === "unknown" ||
        item.summary.start >= options.since,
    );

  const report = buildAggregateReport(options, analyzed);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    renderReport(report);
  }
}
