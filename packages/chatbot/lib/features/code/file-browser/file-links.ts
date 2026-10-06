import type { FileBrowserScope } from "@/components/code/file-browser/types";

/** How a Markdown link inside a rendered note resolves for navigation. */
export type NoteLinkResolution =
  | { kind: "navigate"; path: string }
  /** Looks like a note link but is unsafe (escapes the root, malformed). */
  | { kind: "unsafe" }
  /** Not a note link: external URL, fragment, or a non-`.md` relative. */
  | { kind: "other" };

export interface FileBrowserInitialLocation {
  scope?: FileBrowserScope;
  file?: string;
}

/**
 * Parse the route's search params into a deep-link location. Shared by the
 * server page (initial state) and the client sync (same-route query changes),
 * so both agree on what a URL means. Lives in this pure module because the
 * server page imports it: client-module exports are server-side proxies and
 * cannot be called from a Server Component.
 */
export function initialLocationFrom(searchParams: {
  scope?: string | string[];
  file?: string | string[];
}): FileBrowserInitialLocation {
  const { scope, file } = searchParams;
  return {
    ...(scope === "uncommitted" || scope === "tree" ? { scope } : {}),
    ...(typeof file === "string" && isSafeRelativePath(file) ? { file } : {}),
  };
}

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

const EXTERNAL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const MD_SUFFIX = /\.md$/i;

/**
 * Resolve a Note Link (a Markdown relative link to a `.md` file) against the
 * directory of the file that contains it, per the vault-link convention.
 * Fragments are ignored for now (the destination opens at its top), percent
 * escapes are decoded, and only links that stay inside the project root can
 * navigate: everything else is classified so the caller renders it without
 * navigation instead of leaking a broken external link.
 */
export function resolveNoteLink(
  href: string | undefined,
  containerFile: string | null,
): NoteLinkResolution {
  if (!href || !containerFile) return { kind: "other" };
  if (href.startsWith("//") || EXTERNAL_SCHEME.test(href)) {
    return { kind: "other" };
  }

  let path = href;
  try {
    path = decodeURIComponent(path);
  } catch {
    return { kind: "unsafe" };
  }
  if (path.includes("\\") || path.includes("\0") || path.startsWith("/")) {
    return { kind: "unsafe" };
  }

  const hash = path.indexOf("#");
  if (hash !== -1) path = path.slice(0, hash);
  if (!path || !MD_SUFFIX.test(path)) return { kind: "other" };

  // Join the container's directory with the link, then resolve `.`/`..` by
  // hand: any `..` above the root means the link escapes the project.
  const stack: string[] = [];
  const segments = [
    ...(containerFile.includes("/")
      ? containerFile.split("/").slice(0, -1)
      : []),
    ...path.split("/"),
  ];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (stack.length === 0) return { kind: "unsafe" };
      stack.pop();
      continue;
    }
    stack.push(segment);
  }

  const resolved = stack.join("/");
  if (!isSafeRelativePath(resolved)) return { kind: "unsafe" };
  return { kind: "navigate", path: resolved };
}

/**
 * Extract the project-relative path from a `file:` reference link emitted by
 * the coding agent (see FILE_REFERENCE_PROMPT in the worker). Accepts
 * `file:path`, `file://path` and a trailing `:<line>` suffix, which is
 * dropped. Returns null for anything unsafe or non-`file:`.
 */
export function parseFileReferenceHref(
  href: string | undefined,
): string | null {
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
