/**
 * Portable path resolution for the monorepo (ADR 0011 §3.3).
 *
 * `REPO_ROOT` is discovered by walking up from the location of THIS module
 * (`import.meta.url`) until `pnpm-workspace.yaml` is found, with a fallback to
 * the fixed three-level walk-up (`packages/config/src` → root). No config path
 * hardcodes the host's home.
 *
 * On purpose it does NOT import `node:path`/`node:fs`/`node:url`: this module
 * is part of the graph the Next.js bundler links into the client bundle
 * (`config.environment()` is safe in Client Components). File operations are
 * resolved with `process.getBuiltinModule("node:fs")` and only when a Node
 * runtime exists; in the browser the paths are computed the same way (they are
 * never used) and the filesystem is not touched.
 */

/** Directory of `src/paths.ts` (with the trailing `/` removed). */
function moduleDir(): string {
  try {
    const here = new URL(".", import.meta.url);
    if (here.protocol !== "file:") return "";
    return decodeURIComponent(here.pathname).replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function getBuiltinModule(): ((id: string) => unknown) | undefined {
  if (typeof process === "undefined") return undefined;
  const fn = (process as unknown as Record<string, unknown>)["getBuiltinModule"];
  return typeof fn === "function" ? (fn as (id: string) => unknown) : undefined;
}

/** `node:fs` when running on Node; `undefined` in the client bundle. */
function nodeFs(): { existsSync(path: string): boolean } | undefined {
  const getBuiltin = getBuiltinModule();
  if (!getBuiltin) return undefined;
  try {
    return getBuiltin("node:fs") as { existsSync(path: string): boolean };
  } catch {
    return undefined;
  }
}

/** `node:os` when running on Node; `undefined` in the client bundle. */
function nodeOs(): { homedir(): string } | undefined {
  const getBuiltin = getBuiltinModule();
  if (!getBuiltin) return undefined;
  try {
    return getBuiltin("node:os") as { homedir(): string };
  } catch {
    return undefined;
  }
}

/**
 * Normalizes a POSIX path without touching the filesystem: collapses `//`,
 * resolves `.` and `..` and keeps the absolute root. The monorepo only runs on
 * Linux (prod/dev/test are local Node processes), so no win32 normalization is
 * needed.
 */
export function normalizePath(input: string): string {
  const absolute = input.startsWith("/");
  const parts: string[] = [];
  for (const segment of input.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (parts.length > 0 && parts[parts.length - 1] !== "..") parts.pop();
      else if (!absolute) parts.push("..");
      continue;
    }
    parts.push(segment);
  }
  const joined = parts.join("/");
  if (absolute) return `/${joined}`;
  return joined || ".";
}

/** POSIX `path.resolve(...parts)`: an absolute segment restarts the path. */
export function resolvePath(...parts: string[]): string {
  let out = "";
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("/")) {
      out = part;
    } else {
      out = out ? `${out}/${part}` : part;
    }
  }
  return normalizePath(out || ".");
}

/**
 * Optional override of the repo root (ADR 0011). It does NOT select an
 * Environment nor ports: it only allows pointing file resolution at another copy
 * of the monorepo (e.g. a worktree) when the operator declares it explicitly.
 */
function declaredRepoRoot(): string | undefined {
  if (typeof process === "undefined") return undefined;
  const value = process.env?.REPO_ROOT?.trim();
  return value ? value : undefined;
}

function findWorkspaceRoot(
  startDir: string,
  fs: { existsSync(path: string): boolean },
): string | undefined {
  let dir = normalizePath(startDir);
  for (;;) {
    if (fs.existsSync(`${dir}/pnpm-workspace.yaml`)) return dir || "/";
    const parent = dir.replace(/\/[^/]+$/, "");
    if (!parent || parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function discoverRepoRoot(): string {
  const declared = declaredRepoRoot();
  if (declared) return normalizePath(declared);

  const fs = nodeFs();
  const start = moduleDir();
  if (fs) {
    if (start) {
      const fromStart = findWorkspaceRoot(start, fs);
      if (fromStart) return fromStart;
    }
    if (typeof process !== "undefined" && typeof process.cwd === "function") {
      try {
        const fromCwd = findWorkspaceRoot(process.cwd(), fs);
        if (fromCwd) return fromCwd;
      } catch {
        // Ignored
      }
    }
  }

  // Fallback: `packages/config/src` → monorepo root if start exists.
  if (start) return resolvePath(start, "../../..");
  if (typeof process !== "undefined" && typeof process.cwd === "function") {
    try {
      return normalizePath(process.cwd());
    } catch {
      // Ignored
    }
  }
  return ".";
}

/** Absolute root of the monorepo. */
export const REPO_ROOT: string = discoverRepoRoot();

/** Absolute path inside the monorepo root. */
export function repoPath(...segments: string[]): string {
  return resolvePath(REPO_ROOT, ...segments);
}

export type PackageName = "chatbot" | "coding-agent" | "config" | "tracing";

/** Absolute path inside `packages/<pkg>`. */
export function packagePath(pkg: PackageName, ...segments: string[]): string {
  return resolvePath(REPO_ROOT, "packages", pkg, ...segments);
}

/**
 * Path inside the user's home without `node:os` in the client graph.
 * It exists only for the historical Production exception (ADR 0002): the prod
 * session paths stay outside `repoPath`.
 */
export function homePath(...segments: string[]): string {
  const home = nodeOs()?.homedir() ?? "";
  return resolvePath(home || "/", ...segments);
}
