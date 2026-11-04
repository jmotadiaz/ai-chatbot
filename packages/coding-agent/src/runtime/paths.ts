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
 * Root of the artifacts the agent publishes (`<root>/<project>/<name>/index.html`,
 * see `src/artifacts/artifacts.ts`). Kept under the worker-owned `.pi/` directory,
 * which is gitignored, so generated reports never land in the repo. The Chatbot
 * reads this root to serve artifact views; the worker serves nothing over HTTP.
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
