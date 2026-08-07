import path from "node:path";
import { existsSync, readdirSync } from "node:fs";
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

/**
 * Override extension that exposes harness skills with higher precedence than
 * third-party package skills. Placed first in `getExtensionPaths()` so that
 * skills discovered by its `resources_discover` hook win name collisions
 * against superpowers and other Pi packages.
 */
const OVERRIDE_EXTENSION_DIR = path.join(PACKAGE_ROOT, "extensions", "override");

function getOverrideExtensionPath(): string | null {
  if (existsSync(path.join(OVERRIDE_EXTENSION_DIR, "index.ts"))) {
    return OVERRIDE_EXTENSION_DIR;
  }
  return null;
}

/**
 * First-party extensions live inside the package (`extensions/<name>/index.ts`)
 * instead of `PI_PACKAGES`, which is reserved for pinned third-party git
 * checkouts.
 */
const FIRST_PARTY_EXTENSIONS_DIR = path.join(PACKAGE_ROOT, "extensions");

/** First-party extension dirs (each with an index.ts), e.g. extensions/subagent. */
export function getFirstPartyExtensionPaths(): string[] {
  if (!existsSync(FIRST_PARTY_EXTENSIONS_DIR)) return [];
  return readdirSync(FIRST_PARTY_EXTENSIONS_DIR, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        d.name !== "override" &&
        existsSync(path.join(FIRST_PARTY_EXTENSIONS_DIR, d.name, "index.ts")),
    )
    .map((d) => path.join(FIRST_PARTY_EXTENSIONS_DIR, d.name));
}

/**
 * All extension paths handed to the Pi resource loader. Precedence:
 * override (harness skills that shadow Pi packages) > Pi packages
 * (superpowers) > first-party extensions (subagent, etc.).
 *
 * `includeSubagentExtension: false` excludes the subagent tool — child
 * sessions must not get it (structural anti-recursion, spec §4.2).
 */
export function getExtensionPaths(options?: {
  includeSubagentExtension?: boolean;
}): string[] {
  const firstParty = getFirstPartyExtensionPaths().filter(
    (p) =>
      options?.includeSubagentExtension !== false ||
      !p.endsWith(path.join("extensions", "subagent")),
  );
  const override = getOverrideExtensionPath();
  const paths: string[] = [...getPiPackagePaths()];
  if (override) paths.unshift(override);
  paths.push(...firstParty);
  return paths;
}
