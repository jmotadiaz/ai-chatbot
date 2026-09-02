import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Artifacts: reports and other generated documents the agent produces for the
 * human to read in a browser.
 *
 * The skills that generate them (Matt Pocock's `improve-codebase-architecture`
 * and friends) were written for a laptop: they write a self-contained HTML file
 * to the OS temp directory and `xdg-open` it. The agent runs on a headless
 * host, so the file lands where nobody can see it and the open is a silent
 * no-op. Publishing moves a file from an unreachable path into one known root
 * (`getArtifactsDir()`) that the worker also serves read-only over
 * `GET /artifacts`, and hands back the URL to show the user.
 *
 * Stateless by design: the Pi extension reaches this module through jiti, which
 * loads a second module instance (see `src/subagent-bridge.ts` for why that is
 * a hazard elsewhere in the worker). Nothing here caches anything in module
 * scope, so both copies behave identically.
 */

/** Types the viewer serves inline in the browser; anything else stays unpublished. */
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".log": "text/plain; charset=utf-8",
  ".json": "application/json",
  ".csv": "text/csv; charset=utf-8",
};

/** A published artifact, as served and as listed in the index. */
export interface ArtifactRef {
  /** Directory under the artifacts root; the project the artifact belongs to. */
  project: string;
  /** File name inside `project`. `project`/`name` is the artifact's URL identity. */
  name: string;
  /** Display label: the `<title>` of an HTML report, else the file name. */
  title: string;
  url: string;
  size: number;
  /** File mtime in ms; what the index sorts by. */
  updatedAt: number;
}

export interface PublishArtifactOptions {
  /** File the agent just generated. Anywhere it likes — `/tmp` included. */
  sourcePath: string;
  /** Artifacts root (`getArtifactsDir()`). */
  rootDir: string;
  /** Browser-reachable base URL (`getArtifactsBaseUrl()`), no trailing slash. */
  baseUrl: string;
  /** Session working directory; decides the project grouping. */
  cwd?: string;
  title?: string;
}

/** Content type served for an artifact name. */
export function contentTypeFor(name: string): string | undefined {
  return CONTENT_TYPES[path.extname(name).toLowerCase()];
}

/**
 * One path segment, and nothing that could climb out of the artifacts root.
 * Rejects `.`/`..`, separators, dotfiles and anything not starting alphanumerics.
 */
export function isSafeSegment(segment: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(segment) && !segment.includes("..");
}

/** Project grouping for a session: the repository directory name. */
export function projectSlug(cwd: string = process.cwd()): string {
  const base = path.basename(path.resolve(cwd)) || "default";
  const slug = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[.-]+/, "");
  return isSafeSegment(slug) ? slug : "default";
}

export function artifactUrl(baseUrl: string, project: string, name: string): string {
  const base = baseUrl.replace(/\/+$/, "").replace(/^([^/]+)\/+$/, "$1");
  return `${base}/artifacts/${encodeURIComponent(project)}/${encodeURIComponent(name)}`;
}

/**
 * File name for the published copy: the source's own base name, sanitized.
 * Timestamped names from the skills (`architecture-review-20260831-153639`)
 * survive untouched, so URLs stay recognizable. The result always satisfies
 * `isSafeSegment`, which is what keeps a published name servable.
 */
export function artifactNameFor(sourcePath: string): string {
  const rawExt = path.extname(sourcePath).toLowerCase();
  const stem = path.basename(sourcePath, path.extname(sourcePath));
  const clean = stem
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    // `a..b` would otherwise survive and be rejected as a path segment, which
    // strands an artifact that was published but can never be served.
    .replace(/\.{2,}/g, ".")
    .replace(/^[.-]+|[-.]+$/g, "")
    .slice(0, 120);
  // ". HTM" (a real `path.extname` output) still means an .htm file.
  const ext = rawExt.replace(/[^a-z0-9]/g, "");
  return `${clean || "artifact"}.${ext || "txt"}`;
}

/** `<title>` of an HTML document, if it has one (reports always do). */
export function titleFromHtml(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i);
  const text = match?.[1]
    .replace(/<[^>]+>/g, "")
    .replace(/&#\d+;|&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

/**
 * Whether a file written at `filePath` is an artifact generated for reading
 * rather than source code the agent is editing: HTML/markdown inside the OS
 * temp directory. Repo-internal `.html` (app pages, templates, fixtures)
 * deliberately does not qualify. Used by the extension's automatic publish.
 */
export function isTempArtifactPath(
  filePath: string,
  tmpRoot: string = os.tmpdir(),
): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".html" && ext !== ".htm" && ext !== ".md") return false;
  const resolved = path.resolve(filePath);
  return resolved.startsWith(path.resolve(tmpRoot) + path.sep);
}

/**
 * Copy a generated file into the artifacts root and return its URL.
 *
 * Idempotent on content: publishing an unchanged file again returns the same
 * URL. A changed file whose name is already taken gets a content-hash suffix
 * instead of clobbering the previous version — reports get compared against
 * each other, so losing the last run to a re-run is the failure to avoid.
 */
export async function publishArtifact(
  options: PublishArtifactOptions,
): Promise<ArtifactRef> {
  const source = path.resolve(options.sourcePath);
  const sourceStat = await stat(source).catch(() => undefined);
  if (!sourceStat?.isFile()) {
    throw new Error(`Artifact source not found: ${options.sourcePath}`);
  }

  const project = projectSlug(options.cwd);
  const targetDir = path.join(path.resolve(options.rootDir), project);
  const name = artifactNameFor(source);
  const content = await readFile(source);
  const hash = hashOf(content);

  let finalName = name;
  const target = path.join(targetDir, name);
  const existing = await stat(target).catch(() => undefined);
  if (existing?.isFile() && hashOf(await readFile(target)) !== hash) {
    const ext = path.extname(name);
    finalName = `${path.basename(name, ext)}-${hash}${ext}`;
  }

  const finalPath = path.join(targetDir, finalName);
  const atRest = await stat(finalPath).catch(() => undefined);
  if (!atRest?.isFile()) {
    await mkdir(targetDir, { recursive: true });
    await writeFile(finalPath, content);
  }
  const info = await stat(finalPath);

  return {
    project,
    name: finalName,
    title: options.title ?? titleOf(finalName, content) ?? finalName,
    url: artifactUrl(options.baseUrl, project, finalName),
    size: info.size,
    updatedAt: info.mtimeMs,
  };
}

/** All published artifacts, newest first. A missing root lists as empty. */
export async function listArtifacts(options: {
  rootDir: string;
  baseUrl: string;
  limit?: number;
}): Promise<ArtifactRef[]> {
  const root = path.resolve(options.rootDir);
  if (!existsSync(root)) return [];

  const entries: ArtifactRef[] = [];
  const projects = await readdir(root, { withFileTypes: true });
  for (const project of projects) {
    if (!project.isDirectory() || !isSafeSegment(project.name)) continue;
    const dir = path.join(root, project.name);
    for (const file of await readdir(dir, { withFileTypes: true })) {
      if (!file.isFile() || !isSafeSegment(file.name) || !contentTypeFor(file.name)) {
        continue;
      }
      const info = await stat(path.join(dir, file.name)).catch(() => undefined);
      if (!info?.isFile()) continue;
      entries.push({
        project: project.name,
        name: file.name,
        title:
          titleOf(file.name, await readFile(path.join(dir, file.name))) ?? file.name,
        url: artifactUrl(options.baseUrl, project.name, file.name),
        size: info.size,
        updatedAt: info.mtimeMs,
      });
    }
  }

  entries.sort((a, b) => b.updatedAt - a.updatedAt);
  return entries.slice(0, options.limit ?? 50);
}

/**
 * Resolve a `<project>/<name>` pair to a file inside the artifacts root, or
 * undefined when it is outside the root or not a regular file. The segments are
 * already validated by `matchArtifactRoute`; this is the belt.
 */
export async function resolveArtifactFile(options: {
  rootDir: string;
  project: string;
  name: string;
}): Promise<string | undefined> {
  const root = path.resolve(options.rootDir);
  if (!isSafeSegment(options.project) || !isSafeSegment(options.name)) return undefined;
  const target = path.resolve(root, options.project, options.name);
  if (target === root || !target.startsWith(root + path.sep)) return undefined;
  const info = await stat(target).catch(() => undefined);
  return info?.isFile() ? target : undefined;
}

function hashOf(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 8);
}

function titleOf(name: string, content: Buffer): string | undefined {
  const ext = path.extname(name).toLowerCase();
  if (ext !== ".html" && ext !== ".htm") return undefined;
  return titleFromHtml(content.toString("utf-8"));
}
