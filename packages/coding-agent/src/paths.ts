import path from "node:path";
import { fileURLToPath } from "node:url";

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
