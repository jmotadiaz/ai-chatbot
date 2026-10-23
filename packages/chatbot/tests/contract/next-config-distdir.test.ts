import { afterEach, describe, expect, it, vi } from "vitest";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

/**
 * Contract of `next.config.ts` (tickets 01/03, ADR 0011):
 *
 * - `distDir` is decided by `config.nextBuildDir()`: `.next` by default and
 *   `.next/verify` when the launcher sets the `--verify` flag via
 *   `initConfig(env, { verifyBuild })` (ADR 0006). The old per-environment-
 *   variable `NEXT_BUILD_DIR` selector died in ticket 01.
 * - `next.config.ts` does NOT read `process.argv` or `process.env`: the active
 *   Environment is provided by the launcher process (same process, `initConfig`
 *   already called).
 */
async function loadNextConfig(options: { verifyBuild?: boolean } = {}) {
  vi.resetModules();
  // Same module graph `@/next.config` will use (alias `"config"` → test shim):
  // the build flags live in `facade.ts`, shared.
  const cfg = await import("config");
  cfg.setBuildFlags({
    verifyBuild: options.verifyBuild ?? false,
    allowProdBuild: false,
  });
  const mod = await import("@/next.config");
  const factory = mod.default;
  expect(typeof factory).toBe("function");
  return factory(PHASE_DEVELOPMENT_SERVER);
}

describe("isolatable next.config distDir", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("without --verify it builds into .next (canonical default)", async () => {
    expect((await loadNextConfig()).distDir).toBe(".next");
  });

  it("with --verify (build flag) it builds into the isolated directory", async () => {
    expect((await loadNextConfig({ verifyBuild: true })).distDir).toBe(
      ".next/verify",
    );
  });

  it("NEXT_BUILD_DIR is NO longer a configuration channel (it died in ticket 01)", async () => {
    process.env.NEXT_BUILD_DIR = ".next/verify";
    try {
      expect((await loadNextConfig()).distDir).toBe(".next");
    } finally {
      delete process.env.NEXT_BUILD_DIR;
    }
  });
});
