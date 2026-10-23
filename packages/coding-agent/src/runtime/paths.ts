import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "config";
import { getWorkerRuntimeConfig } from "./runtime-overrides";
import type { WorkerRuntimeConfig } from "./runtime-config";

/** packages/coding-agent — this file lives in its src/runtime/ directory. */
export const PACKAGE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * First non-empty string. Empty values mean "unset": Playwright's web server
 * forwards undefined variables as empty strings, and a DI override that is
 * `""` must fall through to the next source instead of producing a path of `""`.
 */
export function pickOverride(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value) return value;
  }
  return undefined;
}

/**
 * Resolves an override to an absolute path. Relative values are anchored to the
 * package rather than the cwd, which varies between the worker, the chatbot and
 * the test runners. Empty values mean "unset": the Playwright web server
 * forwards undefined variables as empty strings.
 */
export function resolveOverride(value: string | undefined, fallback: string): string {
  return value ? path.resolve(PACKAGE_ROOT, value) : fallback;
}

/**
 * Path resolvers (ADR 0011 §6): pure resolution over DI sources in precedence
 * order — explicit override → process-wide worker config → active Environment
 * bundle → legacy `.pi/` package fallback. Tests inject a sandbox through
 * `createTestWorkerContext()`; the `get*()` wrappers below are the
 * composition-root conveniences for callers outside the worker's DI graph
 * (extensions, scripts).
 */

/**
 * Worker-owned Pi configuration directory.
 *
 * Authentication is supplied separately from the global Pi agent directory,
 * so settings and installed packages cannot leak into the harness runtime.
 */
export function resolveCodingAgentDir(
  cfg?: Pick<WorkerRuntimeConfig, "agentDir">,
): string {
  return resolveOverride(
    pickOverride(cfg?.agentDir, getWorkerRuntimeConfig().agentDir, config.codingAgentAgentDir()),
    path.join(PACKAGE_ROOT, ".pi", "agent"),
  );
}

export function getCodingAgentDir(): string {
  return resolveCodingAgentDir(getWorkerRuntimeConfig());
}

/**
 * Root of the artifacts the agent publishes for the user to read in a browser
 * (HTML reports, markdown digests, PDFs). Kept under the worker-owned `.pi/`
 * directory, which is gitignored: like the OS temp dir it was replacing, it
 * must never land in the repo, but unlike it, it has one known location the
 * `GET /artifacts` route can serve. See `src/artifacts.ts`.
 */
export function resolveArtifactsDir(
  cfg?: Pick<WorkerRuntimeConfig, "artifactsDir">,
): string {
  return resolveOverride(
    pickOverride(
      cfg?.artifactsDir,
      getWorkerRuntimeConfig().artifactsDir,
      config.codingAgentArtifactsDir(),
    ),
    path.join(PACKAGE_ROOT, ".pi", "artifacts"),
  );
}

export function getArtifactsDir(): string {
  return resolveArtifactsDir(getWorkerRuntimeConfig());
}

/**
 * Root where Pi session transcripts are written (ADR 0002 v2).
 *
 * Dev and test point this at their isolated `.pi-dev/sessions` / `.pi-test/sessions`
 * (relative values anchor to the package, never the cwd). Production keeps its
 * current absolute literal untouched — the running service depends on the session
 * history living there and the SDK encodes the project path into that folder.
 */
export function resolveSessionsDir(
  cfg?: Pick<WorkerRuntimeConfig, "sessionsDir">,
): string {
  return resolveOverride(
    pickOverride(
      cfg?.sessionsDir,
      getWorkerRuntimeConfig().sessionsDir,
      config.codingAgentSessionsDir(),
    ),
    path.join(PACKAGE_ROOT, ".pi", "sessions"),
  );
}

export function getSessionsDir(): string {
  return resolveSessionsDir(getWorkerRuntimeConfig());
}

/**
 * Absolute base for artifact URLs. This is what the *user's browser* follows,
 * so it must be reachable from there, not from this process — hence the
 * explicit override, falling back to the worker URL the chatbot is already
 * configured with. No port guessing: the same value that makes `/rpc` work
 * makes `/artifacts` work.
 */
export function resolveArtifactsBaseUrl(
  cfg?: Pick<WorkerRuntimeConfig, "artifactsBaseUrl" | "workerPort">,
): string {
  const ambient = getWorkerRuntimeConfig();
  const explicit = pickOverride(
    cfg?.artifactsBaseUrl,
    ambient.artifactsBaseUrl,
    config.codingAgentArtifactsUrl(),
  );
  // `||`-style empties are handled by pickOverride: an empty value means unset.
  if (explicit) return explicit.replace(/\/+$/, "");
  // A DI-supplied port wins over the bundle's worker URL: a test that injects
  // `workerPort` has no worker URL of its own and expects `localhost:<port>`.
  const port = cfg?.workerPort ?? ambient.workerPort;
  if (port !== undefined) return `http://localhost:${port}`;
  const base =
    config.codingAgentWorkerUrl() ||
    `http://localhost:${config.codingAgentWorkerPort() ?? 3015}`;
  return base.replace(/\/+$/, "");
}

export function getArtifactsBaseUrl(): string {
  return resolveArtifactsBaseUrl(getWorkerRuntimeConfig());
}

/** Root of the per-project checkouts the sessions run in. */
export function resolveProjectsRoot(
  cfg?: Pick<WorkerRuntimeConfig, "projectsRoot">,
): string {
  return (
    pickOverride(
      cfg?.projectsRoot,
      getWorkerRuntimeConfig().projectsRoot,
      config.codingAgentProjectsRoot(),
    ) ?? ""
  );
}

/** HTTP port the worker transport listens on. */
export function resolveWorkerPort(cfg?: Pick<WorkerRuntimeConfig, "workerPort">): number {
  return (
    cfg?.workerPort ??
    getWorkerRuntimeConfig().workerPort ??
    config.codingAgentWorkerPort() ??
    3015
  );
}
