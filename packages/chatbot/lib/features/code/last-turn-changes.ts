import type { AgentItem } from "./types";
import type { ChangedFileMeta } from "@/components/code/file-browser/types";

const FILE_MUTATING_TOOLS = new Set(["write", "edit"]);

function extractPath(argsParsed: unknown): string | null {
  if (typeof argsParsed !== "object" || argsParsed === null) return null;
  const path = (argsParsed as Record<string, unknown>).path;
  return typeof path === "string" && path.length > 0 ? path : null;
}

function isWithinProject(path: string): boolean {
  if (path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path)) return false;
  return !path.split("/").includes("..");
}

/**
 * Files changed by write/edit tool calls in the last turn: every assistant
 * item after the most recent user message (items come from groupItems).
 */
export function lastTurnChangedFiles(items: AgentItem[]): ChangedFileMeta[] {
  const lastUserIdx = items.findLastIndex((item) => item.kind === "user");
  const seen = new Set<string>();
  const files: ChangedFileMeta[] = [];

  for (const item of items.slice(lastUserIdx + 1)) {
    if (item.kind !== "assistant") continue;
    for (const group of item.toolGroups) {
      if (!FILE_MUTATING_TOOLS.has(group.name.toLowerCase())) continue;
      const rawPath = extractPath(group.argsParsed);
      if (!rawPath) continue;
      const path = rawPath.replace(/^\.\//, "");
      if (!isWithinProject(path) || seen.has(path)) continue;
      seen.add(path);
      files.push({ path, status: "modified", changedRanges: [] });
    }
  }
  return files;
}
