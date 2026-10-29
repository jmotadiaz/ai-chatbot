import { readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveCodingAgentDir } from "../runtime/paths";

/**
 * Directory where Pi stores the transcripts keyed by `scopePath`.
 *
 * `SessionManager.create(scopePath)` / `list(scopePath)` receive that path as
 * their `cwd` and resolve `<agent dir>/sessions/--<scopePath encoded>--`.
 * `getDefaultSessionDir` (the SDK's `core/session-manager`) is not part of the
 * package's public exports, so the encoding is mirrored here and pinned by
 * `tests/unit/sessions/session-file-lookup.test.ts`, which writes real sessions
 * through the SDK and reloads them through this module. The worker only ever
 * passes absolute, already-resolved paths, which is all `path.resolve` needs.
 */
export function resolveSessionDir(scopePath: string, agentDir?: string): string {
  const encoded = path.resolve(scopePath).replace(/^[/\\]/, "").replace(/[/\\:]/g, "-");
  const baseDir = agentDir ?? resolveCodingAgentDir();
  return path.join(baseDir, "sessions", `--${encoded}--`);
}

/**
 * Pi writes one transcript per session as `<ISO timestamp>_<sessionId>.jsonl`.
 * `SessionManager.list()` builds a `SessionInfo` per file by reading and
 * parsing every transcript in the directory; locating the file by name is a
 * single `readdir` and lets `SessionManager.open()` read only the session we
 * actually need. The bare `<sessionId>.jsonl` form covers explicit paths
 * (`SessionManager.open(path)`) that skip Pi's timestamp prefix.
 */
export function findSessionFileName(
  fileNames: readonly string[],
  sessionId: string,
): string | undefined {
  const bare = `${sessionId}.jsonl`;
  if (fileNames.includes(bare)) return bare;

  const suffixed = `_${sessionId}.jsonl`;
  let newest: string | undefined;
  for (const name of fileNames) {
    if (!name.endsWith(suffixed)) continue;
    // The timestamp prefix is fixed-width ISO, so lexicographic order is
    // chronological order: keep the most recent transcript.
    if (newest === undefined || name > newest) newest = name;
  }
  return newest;
}

async function listSessionFileNames(dir: string): Promise<string[] | undefined> {
  try {
    // Directories can end in `.jsonl` too; a name match must not try to open one.
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => !entry.isDirectory()).map((entry) => entry.name);
  } catch {
    // A missing sessions directory means "no transcript", same as a miss.
    return undefined;
  }
}

/**
 * Absolute path of a session transcript, or undefined when it is not on disk.
 * `scopePath` is the sessions directory (or `<sessions dir>/subagents`) the
 * worker also hands to `SessionManager.create()`/`list()` as their `cwd`.
 */
export async function findSessionFile(
  scopePath: string,
  sessionId: string,
  agentDir?: string,
): Promise<string | undefined> {
  const dir = resolveSessionDir(scopePath, agentDir);
  const fileNames = await listSessionFileNames(dir);
  if (fileNames) {
    const name = findSessionFileName(fileNames, sessionId);
    if (name !== undefined) return path.join(dir, name);
  }

  // Fallback: if the configured agentDir is isolated (.pi-prod or .pi-dev),
  // look in the canonical global agentDir (~/.pi/agent) to preserve
  // compatibility with historical sessions (ADR 0002).
  const globalAgentDir = path.join(os.homedir(), ".pi", "agent");
  const effectiveAgentDir = agentDir ?? resolveCodingAgentDir();
  if (path.resolve(effectiveAgentDir) !== globalAgentDir) {
    // 1. Try the same scopePath in the global agentDir
    const globalDir = resolveSessionDir(scopePath, globalAgentDir);
    const globalFiles = await listSessionFileNames(globalDir);
    if (globalFiles) {
      const name = findSessionFileName(globalFiles, sessionId);
      if (name !== undefined) return path.join(globalDir, name);
    }

    // 2. Try the historical prod scope (/home/javier/coding-agent/sessions)
    // especially useful for dev when the scopePath is .pi-dev/sessions but the
    // sessions come from the prod history
    const isSubagent = scopePath.endsWith("subagents");
    const legacyProdScope = isSubagent
      ? path.join(os.homedir(), "coding-agent", "sessions", "subagents")
      : path.join(os.homedir(), "coding-agent", "sessions");
    const legacyProdDir = resolveSessionDir(legacyProdScope, globalAgentDir);
    if (legacyProdDir !== globalDir) {
      const legacyProdFiles = await listSessionFileNames(legacyProdDir);
      if (legacyProdFiles) {
        const name = findSessionFileName(legacyProdFiles, sessionId);
        if (name !== undefined) return path.join(legacyProdDir, name);
      }
    }
  }

  return undefined;
}
