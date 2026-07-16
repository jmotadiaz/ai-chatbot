import type {
  ChangedFileMeta,
  DiffHunk,
  FileDiff,
  GitChangeStatus,
  LineRange,
} from "@/components/code/file-browser/types";

/**
 * Unquotes a path as printed by git (quoted when it contains special chars).
 */
function unquoteGitPath(raw: string): string {
  if (!raw.startsWith('"') || !raw.endsWith('"')) return raw;
  return raw
    .slice(1, -1)
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function statusFromPorcelainCode(x: string, y: string): GitChangeStatus {
  if (x === "?" && y === "?") return "untracked";
  if (x === "R" || y === "R") return "renamed";
  if (x === "A" || y === "A") return "added";
  if (x === "D" || y === "D") return "deleted";
  return "modified";
}

/**
 * Parses `git status --porcelain=v1` output into per-file statuses.
 * For renames the reported path is the new one.
 */
export function parsePorcelainStatus(
  output: string,
): { path: string; status: GitChangeStatus }[] {
  const result: { path: string; status: GitChangeStatus }[] = [];
  for (const line of output.split("\n")) {
    if (line.length < 4) continue;
    const x = line[0];
    const y = line[1];
    let pathPart = line.slice(3);
    const arrowIdx = pathPart.indexOf(" -> ");
    if (arrowIdx !== -1) {
      pathPart = pathPart.slice(arrowIdx + 4);
    }
    result.push({
      path: unquoteGitPath(pathPart),
      status: statusFromPorcelainCode(x, y),
    });
  }
  return result;
}

function diffPath(raw: string): string | null {
  const path = raw.split("\t", 1)[0]?.trim() ?? "";
  if (path === "/dev/null") return null;
  return unquoteGitPath(path).replace(/^[ab]\//, "");
}

/**
 * Parses a unified diff into displayable hunks. Each line keeps both its old
 * and new number, so deletions remain representable after the working tree
 * file no longer contains them.
 */
export function parseUnifiedDiff(output: string): Map<string, FileDiff> {
  const diffs = new Map<string, FileDiff>();
  let oldPath: string | null = null;
  let newPath: string | null = null;
  let currentFile: FileDiff | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLineNumber = 0;
  let newLineNumber = 0;

  for (const line of output.split("\n")) {
    if (line.startsWith("diff --git ")) {
      oldPath = null;
      newPath = null;
      currentFile = null;
      currentHunk = null;
      continue;
    }
    if (currentHunk === null && line.startsWith("--- ")) {
      oldPath = diffPath(line.slice(4));
      continue;
    }
    if (currentHunk === null && line.startsWith("+++ ")) {
      newPath = diffPath(line.slice(4));
      const path = newPath ?? oldPath;
      currentFile = path ? { hunks: [] } : null;
      if (path && currentFile) diffs.set(path, currentFile);
      currentHunk = null;
      continue;
    }
    if (!currentFile) continue;

    const hunkMatch =
      /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunkMatch) {
      const oldStart = Number(hunkMatch[1]);
      const oldCount = hunkMatch[2] === undefined ? 1 : Number(hunkMatch[2]);
      const newStart = Number(hunkMatch[3]);
      const newCount = hunkMatch[4] === undefined ? 1 : Number(hunkMatch[4]);
      currentHunk = { oldStart, oldCount, newStart, newCount, lines: [] };
      currentFile.hunks.push(currentHunk);
      oldLineNumber = oldStart;
      newLineNumber = newStart;
      continue;
    }
    if (!currentHunk || line === "\\ No newline at end of file") continue;

    if (line.startsWith(" ")) {
      currentHunk.lines.push({
        kind: "context",
        content: line.slice(1),
        oldLineNumber,
        newLineNumber,
      });
      oldLineNumber += 1;
      newLineNumber += 1;
    } else if (line.startsWith("-")) {
      currentHunk.lines.push({
        kind: "deleted",
        content: line.slice(1),
        oldLineNumber,
        newLineNumber: null,
      });
      oldLineNumber += 1;
    } else if (line.startsWith("+")) {
      currentHunk.lines.push({
        kind: "added",
        content: line.slice(1),
        oldLineNumber: null,
        newLineNumber,
      });
      newLineNumber += 1;
    }
  }
  return diffs;
}

/**
 * Extracts changed ranges of the new file from a parsed unified diff.
 */
export function changedRangesFromDiff(diff: FileDiff): LineRange[] {
  const ranges: LineRange[] = [];
  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      if (line.kind !== "added" || line.newLineNumber === null) continue;
      const previous = ranges.at(-1);
      if (previous && line.newLineNumber === previous.end + 1) {
        previous.end = line.newLineNumber;
      } else {
        ranges.push({ start: line.newLineNumber, end: line.newLineNumber });
      }
    }
  }
  return ranges;
}

/**
 * Parses `git diff --unified=0` output into changed line ranges of the new
 * version of each file. Deletion-only hunks have no new-version range.
 */
export function parseUnifiedZeroDiff(output: string): Map<string, LineRange[]> {
  const ranges = new Map<string, LineRange[]>();
  let oldPath: string | null = null;
  let currentPath: string | null = null;

  for (const line of output.split("\n")) {
    if (line.startsWith("diff --git ")) {
      oldPath = null;
      currentPath = null;
      continue;
    }
    if (currentPath === null && line.startsWith("--- ")) {
      oldPath = diffPath(line.slice(4));
      continue;
    }
    if (line.startsWith("+++ ")) {
      currentPath = diffPath(line.slice(4)) ?? oldPath;
      continue;
    }
    if (!currentPath || !line.startsWith("@@")) continue;

    const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!match) continue;
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    if (count === 0) continue;

    const list = ranges.get(currentPath) ?? [];
    list.push({ start, end: start + count - 1 });
    ranges.set(currentPath, list);
  }
  return ranges;
}

/**
 * Merges statuses and diff ranges into the changed-files payload.
 */
export function buildChangedFiles(
  statuses: { path: string; status: GitChangeStatus }[],
  diffs: Map<string, FileDiff>,
): ChangedFileMeta[] {
  return statuses.map(({ path, status }) => {
    const diff = diffs.get(path) ?? null;
    return {
      path,
      status,
      changedRanges:
        status === "deleted" || status === "untracked" || !diff
          ? []
          : changedRangesFromDiff(diff),
      diff,
    };
  });
}
