import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "config";

/** packages/coding-agent — this file lives in its src/ directory. */
export const PACKAGE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

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
 * Worker-owned Pi configuration directory.
 *
 * Authentication is supplied separately from the global Pi agent directory,
 * so settings and installed packages cannot leak into the harness runtime.
 */
export function getCodingAgentDir(): string {
  return resolveOverride(
    config.codingAgentAgentDir(),
    path.join(PACKAGE_ROOT, ".pi", "agent"),
  );
}

/**
 * Root of the artifacts the agent publishes for the user to read in a browser
 * (HTML reports, markdown digests, PDFs). Kept under the worker-owned `.pi/`
 * directory, which is gitignored: like the OS temp dir it was replacing, it
 * must never land in the repo, but unlike it, it has one known location the
 * `GET /artifacts` route can serve. See `src/artifacts.ts`.
 */
export function getArtifactsDir(): string {
  return resolveOverride(
    config.codingAgentArtifactsDir(),
    path.join(PACKAGE_ROOT, ".pi", "artifacts"),
  );
}

/**
 * Absolute base for artifact URLs. This is what the *user's browser* follows,
 * so it must be reachable from there, not from this process — hence the
 * explicit override, falling back to the worker URL the chatbot is already
 * configured with. No port guessing: the same value that makes `/rpc` work
 * makes `/artifacts` work.
 */
export function getArtifactsBaseUrl(): string {
  const port = config.codingAgentWorkerPort() ?? 3015;
  // `||` not `??`: an empty value means unset — the Playwright web server
  // forwards undefined variables as empty strings.
  const base =
    config.codingAgentArtifactsUrl() ||
    config.codingAgentWorkerUrl() ||
    `http://localhost:${port}`;
  return base.replace(/\/+$/, "");
}
