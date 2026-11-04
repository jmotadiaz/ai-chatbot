import { copyFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Artifacts: standalone HTML documents the agent generates for the human to
 * open, such as architecture artifacts or interactive prototypes.
 *
 * On-disk contract (spec `coding-agent-artifacts`, decision 2):
 *
 *   <artifactsDir>/<project>/<name>/index.html
 *
 * The agent publishes explicitly with `publish_artifact({ path, name })`.
 * Re-publishing the same `name` overwrites the file in place, so the Chatbot
 * URL stays stable. The Chatbot serves the file through its own authenticated
 * route; the worker serves nothing over HTTP.
 *
 * Stateless by design: the Pi extension reaches this module through jiti, which
 * loads a second module instance. Nothing here caches anything in module scope,
 * so both copies behave identically.
 */

/** The only file a published artifact contains. */
const INDEX_FILE = "index.html";

/** Extensions accepted as a single-file artifact source. */
const HTML_EXTENSIONS = new Set([".html", ".htm"]);

/** A published artifact, as listed and as returned to the agent. */
export interface ArtifactRef {
  /** Project grouping: `projectSlug(cwd)` at publish time. */
  project: string;
  /** Artifact folder name: `project`/`name` is its identity on disk. */
  name: string;
  /** Display label: the document's `<title>`, else the artifact name. */
  title: string;
  /** Chatbot-relative view path, see `artifactViewPath()`. */
  path: string;
  /** Absolute path of the published `index.html`. */
  filePath: string;
  size: number;
  /** File mtime in ms; what the listing sorts by. */
  updatedAt: number;
}

export interface PublishArtifactOptions {
  /** HTML file, or a directory containing `index.html`, that the agent generated. */
  sourcePath: string;
  /** Artifact folder name. Must be a safe path segment (`isSafeSegment`). */
  name: string;
  /** Artifacts root (`getArtifactsDir()`). */
  rootDir: string;
  /** Session that publishes; it becomes part of the returned view path. */
  sessionId: string;
  /** Session working directory; decides the project grouping. */
  cwd?: string;
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

/**
 * Chatbot-relative path of an artifact view:
 * `/agent/code/<project>/<sessionId>/artifacts/<name>`. No host and no worker
 * port: the user follows it inside the Chatbot.
 */
export function artifactViewPath(project: string, sessionId: string, name: string): string {
  return [
    "/agent/code",
    encodeURIComponent(project),
    encodeURIComponent(sessionId),
    "artifacts",
    encodeURIComponent(name),
  ].join("/");
}

/** `<title>` of an HTML document, if it has one (artifacts always do). */
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
 * Publish an HTML artifact to `<rootDir>/<project>/<name>/index.html` and return
 * its reference. The source is left in place.
 *
 * `sourcePath` may be an `.html`/`.htm` file, copied as `index.html`, or a
 * directory whose `index.html` is copied. Anything else throws a readable
 * error; the extension turns it into a tool error result.
 */
export async function publishArtifact(options: PublishArtifactOptions): Promise<ArtifactRef> {
  if (!isSafeSegment(options.name)) {
    throw new Error(
      `Invalid artifact name "${options.name}": use letters, digits, dots, dashes or underscores, starting with a letter or digit`,
    );
  }

  const source = await resolveSource(options.sourcePath);
  const project = projectSlug(options.cwd);
  const dir = path.join(path.resolve(options.rootDir), project, options.name);
  const target = path.join(dir, INDEX_FILE);

  // Publishing the already-published file itself must not truncate it: copying
  // a file onto itself would leave it empty.
  if (source !== target) {
    await mkdir(dir, { recursive: true });
    await copyFile(source, target);
  }

  const ref = await readRef(target, project, options.name, options.sessionId);
  if (!ref) throw new Error(`Published artifact is missing after copy: ${target}`);
  return ref;
}

/**
 * All published artifacts, newest first. A missing root lists as empty.
 * Only `<project>/<name>/index.html` counts; other files and folders are ignored.
 */
export async function listArtifacts(options: {
  rootDir: string;
  sessionId: string;
  limit?: number;
}): Promise<ArtifactRef[]> {
  const root = path.resolve(options.rootDir);
  const entries: ArtifactRef[] = [];

  for (const project of await readSubdirectories(root)) {
    if (!isSafeSegment(project)) continue;
    for (const name of await readSubdirectories(path.join(root, project))) {
      if (!isSafeSegment(name)) continue;
      const ref = await readRef(
        path.join(root, project, name, INDEX_FILE),
        project,
        name,
        options.sessionId,
      );
      if (ref) entries.push(ref);
    }
  }

  entries.sort((a, b) => b.updatedAt - a.updatedAt);
  return entries.slice(0, options.limit ?? 50);
}

/**
 * The file to copy for a publish source: the file itself when it is HTML, or the
 * `index.html` of a directory. Throws for anything else.
 */
async function resolveSource(sourcePath: string): Promise<string> {
  const source = path.resolve(sourcePath);
  const info = await stat(source).catch(() => undefined);
  if (!info) {
    throw new Error(`Artifact path not found: ${sourcePath}`);
  }

  if (info.isDirectory()) {
    const index = path.join(source, INDEX_FILE);
    if (!(await isRegularFile(index))) {
      throw new Error(`Artifact directory has no ${INDEX_FILE}: ${sourcePath}`);
    }
    return index;
  }

  if (info.isFile() && HTML_EXTENSIONS.has(path.extname(source).toLowerCase())) {
    return source;
  }

  throw new Error(
    `Artifact must be an .html/.htm file or a directory containing ${INDEX_FILE}, got: ${sourcePath}`,
  );
}

/** Reference for a published `index.html`, or undefined when it does not exist. */
async function readRef(
  filePath: string,
  project: string,
  name: string,
  sessionId: string,
): Promise<ArtifactRef | undefined> {
  const info = await stat(filePath).catch(() => undefined);
  if (!info?.isFile()) return undefined;
  const title = titleFromHtml(await readFile(filePath, "utf-8")) ?? name;
  return {
    project,
    name,
    title,
    path: artifactViewPath(project, sessionId, name),
    filePath,
    size: info.size,
    updatedAt: info.mtimeMs,
  };
}

async function isRegularFile(filePath: string): Promise<boolean> {
  const info = await stat(filePath).catch(() => undefined);
  return info?.isFile() ?? false;
}

/** Names of the subdirectories of `dir`. A missing directory has none. */
async function readSubdirectories(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
