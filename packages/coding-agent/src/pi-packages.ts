import path from "node:path";
import { existsSync } from "node:fs";
import { PACKAGE_ROOT, resolveOverride } from "./paths";

/**
 * Pi packages the worker loads on top of whatever `settings.json` configures.
 *
 * The Pi SDK resolves these through `resourceLoaderOptions.additionalExtensionPaths`,
 * the programmatic equivalent of `pi -e <source>`. Checkouts are kept inside the
 * package (`.pi/packages/`) instead of being installed with `pi install`, which
 * would write to the machine-wide `~/.pi/agent/settings.json` and change every
 * `pi` run outside this repo — the same reasoning that keeps `models.json`
 * project-scoped.
 */
export interface PiPackage {
  name: string;
  repo: string;
  /** Pinned git ref. Tags keep worker startups reproducible and offline-safe. */
  defaultRef: string;
  /** Env var that overrides `defaultRef`. */
  refEnvVar: string;
}

export const PI_PACKAGES: PiPackage[] = [
  {
    name: "superpowers",
    repo: "https://github.com/obra/superpowers.git",
    defaultRef: "v6.2.0",
    refEnvVar: "CODING_AGENT_SUPERPOWERS_REF",
  },
];

/** Directory holding the worker-owned package checkouts. */
export function getPiPackagesDir(): string {
  return resolveOverride(
    process.env.CODING_AGENT_PI_PACKAGES_DIR,
    path.join(PACKAGE_ROOT, ".pi", "packages"),
  );
}

export function getPiPackagePath(pkg: PiPackage): string {
  return path.join(getPiPackagesDir(), pkg.name);
}

export function getPiPackageRef(pkg: PiPackage): string {
  return process.env[pkg.refEnvVar]?.trim() || pkg.defaultRef;
}

/**
 * Absolute paths handed to the Pi resource loader. Missing checkouts are
 * skipped: a worker that never ran `packages:install`, or one that lost network
 * on its first boot, still starts — just without those skills and extensions.
 */
export function getPiPackagePaths(): string[] {
  return PI_PACKAGES.map(getPiPackagePath).filter((dir) => existsSync(dir));
}
