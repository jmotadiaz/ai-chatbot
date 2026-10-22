import { readdir } from "node:fs/promises";
import path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/**
 * Directory where Pi stores the transcripts keyed by `scopePath`.
 *
 * `SessionManager.create(scopePath)` / `list(scopePath)` receive that path as
 * their `cwd` and resolve `<agent dir>/sessions/--<scopePath encoded>--`.
 * `getDefaultSessionDir` (the SDK's `core/session-manager`) is not part of the
 * package's public exports, so the encoding is mirrored here and pinned by
 * `tests/integration/session-file-lookup.test.ts`, which writes real sessions
 * through the SDK and reloads them through this module. The worker only ever
 * passes absolute, already-resolved paths, which is all `path.resolve` needs.
 */
export function resolveSessionDir(scopePath: string): string {
  const encoded = path.resolve(scopePath).replace(/^[/\\]/, "").replace(/[/\\:]/g, "-");
  return path.join(getAgentDir(), "sessions", `--${encoded}--`);
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

/**
 * Absolute path of a session transcript, or undefined when it is not on disk.
 * `scopePath` is the sessions directory (or `<sessions dir>/subagents`) the
 * worker also hands to `SessionManager.create()`/`list()` as their `cwd`.
 */
export async function findSessionFile(
  scopePath: string,
  sessionId: string,
): Promise<string | undefined> {
  const dir = resolveSessionDir(scopePath);
  let fileNames: string[];
  try {
    // Directories can end in `.jsonl` too; a name match must not try to open one.
    const entries = await readdir(dir, { withFileTypes: true });
    fileNames = entries.filter((entry) => !entry.isDirectory()).map((entry) => entry.name);
  } catch {
    // A missing sessions directory means "no transcript", same as a miss.
    return undefined;
  }
  const name = findSessionFileName(fileNames, sessionId);
  return name === undefined ? undefined : path.join(dir, name);
}
