import type {
  ChangedFileMeta,
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

/**
 * Parses `git diff --unified=0` output into changed line ranges of the
 * new version of each file. Deletion-only hunks (zero new lines) are skipped.
 */
export function parseUnifiedZeroDiff(output: string): Map<string, LineRange[]> {
  const ranges = new Map<string, LineRange[]>();
  let currentFile: string | null = null;

  for (const line of output.split("\n")) {
    if (line.startsWith("+++ ")) {
      const target = line.slice(4).trim();
      if (target === "/dev/null") {
        currentFile = null;
      } else {
        currentFile = unquoteGitPath(target.replace(/^b\//, ""));
      }
      continue;
    }
    if (!line.startsWith("@@") || currentFile === null) continue;

    const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!match) continue;
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    if (count === 0) continue;

    const list = ranges.get(currentFile) ?? [];
    list.push({ start, end: start + count - 1 });
    ranges.set(currentFile, list);
  }
  return ranges;
}

/**
 * Merges statuses and diff ranges into the changed-files payload.
 */
export function buildChangedFiles(
  statuses: { path: string; status: GitChangeStatus }[],
  ranges: Map<string, LineRange[]>,
): ChangedFileMeta[] {
  return statuses.map(({ path, status }) => ({
    path,
    status,
    changedRanges:
      status === "deleted" || status === "untracked"
        ? []
        : (ranges.get(path) ?? []),
  }));
}
