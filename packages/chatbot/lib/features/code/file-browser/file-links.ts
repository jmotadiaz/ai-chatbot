import type { FileBrowserScope } from "@/components/code/file-browser/types";

/**
 * A project-root-relative POSIX path that is safe to echo into URLs and
 * file-browser state: non-empty, relative, and free of traversal segments.
 * Actual filesystem access is still validated server-side.
 */
export function isSafeRelativePath(path: string): boolean {
  if (!path || path.startsWith("/") || path.endsWith("/")) return false;
  if (path.includes("\\") || path.includes("\0")) return false;
  const segments = path.split("/");
  return segments.every((s) => s.length > 0 && s !== "." && s !== "..");
}

function filesUrl(
  project: string,
  sessionId: string,
  scope: FileBrowserScope,
  path: string,
): string {
  const params = new URLSearchParams({ scope, file: path });
  return `/agent/code/${encodeURIComponent(project)}/${encodeURIComponent(sessionId)}/files?${params}`;
}

/** Deep link into the diff view of an uncommitted change. */
export function diffViewHref(
  project: string,
  sessionId: string,
  path: string,
): string {
  return filesUrl(project, sessionId, "uncommitted", path);
}

/** Deep link into the full-file view. */
export function fileViewHref(
  project: string,
  sessionId: string,
  path: string,
): string {
  return filesUrl(project, sessionId, "tree", path);
}

/**
 * Extract the project-relative path from a `file:` reference link emitted by
 * the coding agent (see FILE_REFERENCE_PROMPT in the worker). Accepts
 * `file:path`, `file://path` and a trailing `:<line>` suffix, which is
 * dropped. Returns null for anything unsafe or non-`file:`.
 */
export function parseFileReferenceHref(href: string | undefined): string | null {
  if (!href || !href.startsWith("file:")) return null;
  let path = href.slice("file:".length);
  if (path.startsWith("//")) path = path.slice(2);
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  path = path.replace(/:\d+(?:-\d+)?$/, "");
  return isSafeRelativePath(path) ? path : null;
}
