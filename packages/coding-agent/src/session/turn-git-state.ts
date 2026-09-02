import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GIT_OUTPUT_MAX_BUFFER = 10 * 1024 * 1024;

export type TurnFileStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked";

export interface TurnChangedFile {
  /** POSIX path relative to the project root. */
  path: string;
  status: TurnFileStatus;
}

interface DirtyFileEntry {
  /** Two-letter XY code from `git status --porcelain=v1`. */
  xy: string;
  /**
   * Cheap fingerprint of the file's dirty state (status + size + mtime).
   * Two captures with equal fingerprints are treated as "not touched in
   * between"; content hashing would be exact but costs a git call per file.
   */
  fingerprint: string;
}

/** Snapshot of every dirty (staged, unstaged, or untracked) path in a repo. */
export type GitFileState = Map<string, DirtyFileEntry>;

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: GIT_OUTPUT_MAX_BUFFER,
  });
  return stdout;
}

export interface StatusEntry {
  path: string;
  xy: string;
}

/**
 * Parse `git status --porcelain=v1 -z` output. In -z mode entries are
 * NUL-terminated and a rename/copy record is followed by one extra
 * NUL-terminated token holding the original path.
 */
export function parsePorcelainStatusZ(output: string): StatusEntry[] {
  const tokens = output.split("\0").filter((t) => t.length > 0);
  const entries: StatusEntry[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (token.length < 4) continue;
    const xy = token.slice(0, 2);
    const path = token.slice(3);
    entries.push({ xy, path });
    if (xy[0] === "R" || xy[0] === "C") {
      // Skip the "original path" token of a rename/copy record.
      i += 1;
    }
  }
  return entries;
}

export function statusFromXY(xy: string): TurnFileStatus {
  if (xy === "??") return "untracked";
  if (xy.includes("R")) return "renamed";
  if (xy.includes("D")) return "deleted";
  if (xy.includes("A")) return "added";
  return "modified";
}

/**
 * Capture the dirty-file state of the repo at `cwd`.
 * Returns null when `cwd` is not inside a git work tree (or git fails),
 * which callers treat as "turn diffing unavailable".
 */
export async function captureGitFileState(
  cwd: string,
): Promise<GitFileState | null> {
  try {
    await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    return null;
  }

  let statusOutput: string;
  try {
    statusOutput = await git(cwd, ["status", "--porcelain=v1", "-z", "-uall"]);
  } catch {
    return null;
  }

  const state: GitFileState = new Map();
  for (const entry of parsePorcelainStatusZ(statusOutput)) {
    let fingerprint = entry.xy;
    try {
      const fileStat = await stat(join(cwd, entry.path));
      fingerprint += `:${fileStat.size}:${fileStat.mtimeMs}`;
    } catch {
      fingerprint += ":absent";
    }
    state.set(entry.path, { xy: entry.xy, fingerprint });
  }
  return state;
}

/**
 * Files touched during a turn: every path that is dirty after the turn and
 * was either clean before it or has a different dirty fingerprint now.
 * Paths that left the dirty set during the turn (committed or reverted) are
 * skipped — there is no uncommitted diff left to show for them.
 */
export function diffTurnFiles(
  before: GitFileState | null,
  after: GitFileState | null,
): TurnChangedFile[] {
  if (!after) return [];
  const changed: TurnChangedFile[] = [];
  for (const [path, entry] of after) {
    if (before?.get(path)?.fingerprint === entry.fingerprint) continue;
    changed.push({ path, status: statusFromXY(entry.xy) });
  }
  return changed.sort((a, b) => a.path.localeCompare(b.path));
}
