#!/usr/bin/env tsx
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Measures how CodeGraph is used in coding-agent sessions.
 *
 * Answers the questions the AGENTS.md playbook is supposed to move:
 * adoption (does the model reach for CodeGraph?), command mix (locate vs
 * understand), context cost (bytes per tool), and waste (files `explore`
 * already printed that the model opens again).
 *
 * Reads Pi's session logs (`.pi-<env>/agent/sessions/<cwd>/*.jsonl`); this is
 * a read-only analysis, safe to run against prod logs while the worker runs.
 *
 * Usage:
 *   pnpm --filter coding-agent analyze:codegraph
 *   pnpm --filter coding-agent analyze:codegraph -- --since 2026-11-01 --env all
 *   pnpm --filter coding-agent analyze:codegraph -- --json
 */

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CODEGRAPH_SUBCOMMANDS = [
  "explore",
  "query",
  "node",
  "callers",
  "callees",
  "impact",
  "affected",
  "files",
  "status",
  "sync",
  "index",
  "init",
] as const;

type CodegraphCommand = (typeof CODEGRAPH_SUBCOMMANDS)[number];

type Category =
  | `codegraph:${CodegraphCommand}`
  | "codegraph:other"
  | "grep"
  | "cat"
  | "find"
  | "read"
  | "edit"
  | "write"
  | "subagent"
  | "bash";

interface ToolCall {
  id: string;
  name: string;
  category: Category;
  subcommand: string;
  command: string;
  filePath: string;
}

interface ToolResult {
  bytes: number;
  text: string;
}

interface Session {
  file: string;
  env: string;
  start: string;
  model: string | null;
  subagent: boolean;
  calls: ToolCall[];
  results: Map<string, ToolResult>;
}

interface SessionMetrics {
  file: string;
  env: string;
  start: string;
  model: string | null;
  subagent: boolean;
  calls: number;
  codegraphCalls: number;
  mix: Record<string, number>;
  outputBytes: number;
  codegraphBytes: number;
  exploreBytes: number[];
  printedFiles: number;
  reReadFiles: number;
  codegraphCommands: Record<string, number>;
}

interface Options {
  since: string;
  env: "prod" | "dev" | "test" | "all";
  json: boolean;
}

const CODEGRAPH_INVOCATION_RE =
  /(?:^|&&|;|\|\||\||\btimeout\s+\d+[sm]?\s+|\()\s*codegraph\s+([a-z-]+)/;

const FILE_PATH_RE =
  /(?:^|[\s"'(])((?:packages|docs|scripts|extensions|tests|src|\.agents|\.scratch)\/[A-Za-z0-9_\-./@]+\.(?:tsx?|jsx?|mjs|cjs|json|md|ya?ml|py))/g;

function parseArgs(argv: string[]): Options {
  const options: Options = {
    since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    env: "prod",
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

function parseEnv(value: string): Options["env"] {
  if (value === "prod" || value === "dev" || value === "test" || value === "all") return value;
  throw new Error(`--env must be prod, dev, test or all (got "${value}")`);
}

function printUsage(): void {
  console.log(
    [
      "Usage: analyze-codegraph-usage [--since YYYY-MM-DD] [--env prod|dev|test|all] [--json]",
      "",
      "Defaults: --since 7 days ago, --env prod.",
      "Reads .pi-<env>/agent/sessions/*/*.jsonl; never writes.",
    ].join("\n"),
  );
}

function sessionRoots(env: Options["env"]): { env: string; dir: string }[] {
  const envs = env === "all" ? ["prod", "dev", "test"] : [env];
  return envs
    .map((name) => ({
      env: name,
      dir: path.join(PACKAGE_ROOT, `.pi-${name}`, "agent", "sessions"),
    }))
    .filter((entry) => existsSync(entry.dir));
}

function sessionFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const bucket = path.join(dir, entry.name);
    for (const file of readdirSync(bucket)) {
      if (file.endsWith(".jsonl")) files.push(path.join(bucket, file));
    }
  }
  return files.sort();
}

function classify(name: string, args: Record<string, unknown>): {
  category: Category;
  subcommand: string;
  command: string;
  filePath: string;
} {
  if (name !== "bash") {
    const known: Record<string, Category> = {
      read: "read",
      edit: "edit",
      write: "write",
      subagent: "subagent",
    };
    return {
      category: known[name] ?? "bash",
      subcommand: "",
      command: "",
      filePath: typeof args.path === "string" ? args.path : "",
    };
  }

  const command = typeof args.command === "string" ? args.command : "";
  const codegraph = command.match(CODEGRAPH_INVOCATION_RE);
  if (codegraph) {
    const subcommand = codegraph[1] as CodegraphCommand;
    return {
      category: CODEGRAPH_SUBCOMMANDS.includes(subcommand)
        ? `codegraph:${subcommand}`
        : "codegraph:other",
      subcommand,
      command,
      filePath: "",
    };
  }
  if (/\b(rg|grep)\b/.test(command)) {
    return { category: "grep", subcommand: "", command, filePath: "" };
  }
  if (/\b(cat|head|tail|sed|awk)\b/.test(command)) {
    return { category: "cat", subcommand: "", command, filePath: "" };
  }
  if (/\b(find|fd|ls|tree)\b/.test(command)) {
    return { category: "find", subcommand: "", command, filePath: "" };
  }
  return { category: "bash", subcommand: "", command, filePath: "" };
}

function parseSession(file: string, env: string): Session | null {
  const session: Session = {
    file,
    env,
    start: "",
    model: null,
    subagent: file.includes(`${path.sep}subagents${path.sep}`),
    calls: [],
    results: new Map(),
  };

  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const type = record.type;
    if (type === "session") {
      session.start = typeof record.timestamp === "string" ? record.timestamp : "";
    } else if (type === "model_change") {
      session.model = typeof record.modelId === "string" ? record.modelId : session.model;
    } else if (type === "message") {
      const message = record.message as Record<string, unknown> | undefined;
      if (!message) continue;
      if (message.role === "toolResult") {
        const id = String(message.toolCallId ?? "");
        session.results.set(id, {
          bytes: contentBytes(message.content),
          text: contentText(message.content),
        });
        continue;
      }
      const content = Array.isArray(message.content) ? message.content : [];
      for (const part of content) {
        if (!isRecord(part) || part.type !== "toolCall") continue;
        const args = isRecord(part.arguments) ? part.arguments : {};
        const classified = classify(String(part.name ?? ""), args);
        session.calls.push({
          id: String(part.id ?? ""),
          name: String(part.name ?? ""),
          ...classified,
        });
      }
    }
  }

  return session.start ? session : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function contentText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter(isRecord)
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("");
}

function contentBytes(content: unknown): number {
  return contentText(content).length;
}

/** Repo-relative form so absolute read paths and explore output compare equal. */
function normalizePath(value: string): string | null {
  const match = value.match(
    /((?:packages|docs|scripts|extensions|tests|src|\.agents|\.scratch)\/[A-Za-z0-9_\-./@]+\.(?:tsx?|jsx?|mjs|cjs|json|md|ya?ml|py))/,
  );
  if (!match) return null;
  return match[1].replace(/:\d+$/, "");
}

function pathsInCommand(command: string): string[] {
  const found: string[] = [];
  for (const match of command.matchAll(FILE_PATH_RE)) {
    const normalized = normalizePath(match[1]);
    if (normalized) found.push(normalized);
  }
  return found;
}

function analyze(session: Session): SessionMetrics {
  const mix: Record<string, number> = {};
  const codegraphCommands: Record<string, number> = {};
  let outputBytes = 0;
  let codegraphBytes = 0;
  const exploreBytes: number[] = [];

  for (const call of session.calls) {
    mix[call.category] = (mix[call.category] ?? 0) + 1;
    if (call.category.startsWith("codegraph:")) {
      const subcommand = call.subcommand || "other";
      codegraphCommands[subcommand] = (codegraphCommands[subcommand] ?? 0) + 1;
    }

    const result = session.results.get(call.id);
    if (!result) continue;
    outputBytes += result.bytes;
    if (call.category.startsWith("codegraph:")) {
      codegraphBytes += result.bytes;
      if (call.category === "codegraph:explore") exploreBytes.push(result.bytes);
    }
  }

  // Files `explore` printed that the model opened again (read or cat/sed/head).
  const printed = new Set<string>();
  for (const call of session.calls) {
    if (call.category !== "codegraph:explore") continue;
    const text = session.results.get(call.id)?.text ?? "";
    for (const match of text.matchAll(FILE_PATH_RE)) {
      const normalized = normalizePath(match[1]);
      if (normalized) printed.add(normalized);
    }
  }
  const reRead = new Set<string>();
  for (const call of session.calls) {
    if (call.category === "read") {
      const normalized = normalizePath(call.filePath);
      if (normalized && printed.has(normalized)) reRead.add(normalized);
    } else if (call.category === "cat") {
      for (const file of pathsInCommand(call.command)) {
        if (printed.has(file)) reRead.add(file);
      }
    }
  }

  const codegraphCalls = Object.entries(mix)
    .filter(([category]) => category.startsWith("codegraph:"))
    .reduce((total, [, count]) => total + count, 0);

  return {
    file: session.file,
    env: session.env,
    start: session.start,
    model: session.model,
    subagent: session.subagent,
    calls: session.calls.length,
    codegraphCalls,
    mix,
    outputBytes,
    codegraphBytes,
    exploreBytes,
    printedFiles: printed.size,
    reReadFiles: reRead.size,
    codegraphCommands,
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function kb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

function pct(part: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((100 * part) / total)}%`;
}

function render(rows: SessionMetrics[], options: Options): void {
  const sessions = rows.length;
  const withCodegraph = rows.filter((row) => row.codegraphCalls > 0).length;
  const calls = rows.reduce((total, row) => total + row.calls, 0);
  const codegraphCalls = rows.reduce((total, row) => total + row.codegraphCalls, 0);
  const outputBytes = rows.reduce((total, row) => total + row.outputBytes, 0);
  const codegraphBytes = rows.reduce((total, row) => total + row.codegraphBytes, 0);
  const exploreBytes = rows.flatMap((row) => row.exploreBytes);
  const printedFiles = rows.reduce((total, row) => total + row.printedFiles, 0);
  const reReadFiles = rows.reduce((total, row) => total + row.reReadFiles, 0);
  const commands: Record<string, number> = {};
  for (const row of rows) {
    for (const [command, count] of Object.entries(row.codegraphCommands)) {
      commands[command] = (commands[command] ?? 0) + count;
    }
  }
  const mix: Record<string, number> = {};
  for (const row of rows) {
    for (const [category, count] of Object.entries(row.mix)) {
      mix[category] = (mix[category] ?? 0) + count;
    }
  }

  console.log(`Window: since ${options.since} — ${sessions} session(s), env=${options.env}`);
  console.log(
    `CodeGraph adoption: ${withCodegraph}/${sessions} sessions (${pct(withCodegraph, sessions)})`,
  );
  console.log(
    `Tool calls: ${calls} — codegraph ${codegraphCalls} (${pct(codegraphCalls, calls)})`,
  );
  console.log(
    `Tool output: ${kb(outputBytes)} — codegraph ${kb(codegraphBytes)} (${pct(codegraphBytes, outputBytes)})`,
  );
  if (exploreBytes.length > 0) {
    console.log(
      `explore: n=${exploreBytes.length} median=${kb(median(exploreBytes))} p90=${kb(percentile(exploreBytes, 0.9))} max=${kb(Math.max(...exploreBytes))}`,
    );
  }
  console.log(
    `Re-reads: ${reReadFiles}/${printedFiles} files printed by explore were opened again (${pct(reReadFiles, printedFiles)})`,
  );
  console.log(
    `CodeGraph commands: ${
      Object.entries(commands)
        .sort((a, b) => b[1] - a[1])
        .map(([command, count]) => `${command}=${count}`)
        .join(" ") || "none"
    }`,
  );
  console.log(
    `Call mix: ${
      Object.entries(mix)
        .sort((a, b) => b[1] - a[1])
        .map(([category, count]) => `${category}=${count}`)
        .join(" ")
    }`,
  );
  console.log("");
  console.log(
    ["start", "env", "kind", "calls", "cg", "cgKB", "re-read", "commands", "model"].join("\t"),
  );
  for (const row of rows.sort((a, b) => a.start.localeCompare(b.start))) {
    console.log(
      [
        row.start.slice(0, 16),
        row.env,
        row.subagent ? "sub" : "main",
        row.calls,
        row.codegraphCalls,
        Math.round(row.codegraphBytes / 1024),
        `${row.reReadFiles}/${row.printedFiles}`,
        Object.entries(row.codegraphCommands)
          .map(([command, count]) => `${command}=${count}`)
          .join(",") || "-",
        row.model ?? "-",
      ].join("\t"),
    );
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const sessions = sessionRoots(options.env)
    .flatMap(({ env, dir }) => sessionFiles(dir).map((file) => parseSession(file, env)))
    .filter((session): session is Session => session !== null)
    .filter((session) => session.start >= options.since);

  const rows = sessions.map(analyze);
  if (options.json) {
    console.log(JSON.stringify({ window: options, sessions: rows }, null, 2));
    return;
  }
  render(rows, options);
}

main();
