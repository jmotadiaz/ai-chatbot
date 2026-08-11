import path from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { config, readEnv } from "config";
import { PACKAGE_ROOT, resolveOverride } from "./paths";

/**
 * Pi packages the worker loads from pinned, worker-owned checkouts.
 *
 * The Pi SDK resolves their entrypoints through
 * `resourceLoaderOptions.additionalExtensionPaths`, the programmatic equivalent
 * of `pi -e <file>`. Checkouts are kept inside `.pi/packages/` instead of being
 * installed with `pi install`, which would change machine-wide Pi settings.
 */
export interface PiPackage {
  name: string;
  repo: string;
  /** Pinned git ref. Tags keep worker startups reproducible and offline-safe. */
  defaultRef: string;
  /** Env var that overrides `defaultRef`. */
  refEnvVar: string;
  /**
   * Extension entrypoints loaded from the checkout instead of handing Pi the
   * package root. This deliberately bypasses package.json resource discovery:
   * package-declared skills otherwise load before extension resources and can
   * shadow harness overrides before `resources_discover` runs.
   */
  extensionEntrypoints: string[];
}

export const PI_PACKAGES: PiPackage[] = [
  {
    name: "superpowers",
    repo: "https://github.com/obra/superpowers.git",
    defaultRef: "v6.2.0",
    refEnvVar: "CODING_AGENT_SUPERPOWERS_REF",
    // The extension registers ./skills through resources_discover. Loading
    // this file directly avoids also loading the duplicate pi.skills manifest
    // entry and leaves the upstream checkout untouched.
    extensionEntrypoints: [".pi/extensions/superpowers.ts"],
  },
];

/** Directory holding the worker-owned package checkouts. */
export function getPiPackagesDir(): string {
  return resolveOverride(
    config.codingAgentPiPackagesDir(),
    path.join(PACKAGE_ROOT, ".pi", "packages"),
  );
}

export function getPiPackagePath(pkg: PiPackage): string {
  return path.join(getPiPackagesDir(), pkg.name);
}

export function getPiPackageRef(pkg: PiPackage): string {
  return readEnv(pkg.refEnvVar)?.trim() || pkg.defaultRef;
}

/** Extension files handed to Pi without loading their package manifests. */
export function getPiPackageExtensionPaths(): string[] {
  return PI_PACKAGES.flatMap((pkg) =>
    pkg.extensionEntrypoints.map((entrypoint) =>
      path.join(getPiPackagePath(pkg), entrypoint),
    ),
  ).filter((entrypoint) => existsSync(entrypoint));
}

/**
 * Override extension that exposes harness skills with higher precedence than
 * third-party package skills. Placed first in `getExtensionPaths()` so that
 * skills discovered by its `resources_discover` hook win name collisions
 * against superpowers and other Pi packages.
 */
const OVERRIDE_EXTENSION_DIR = path.join(PACKAGE_ROOT, "extensions", "override");
const SKILLS_OVERRIDE_DIR = path.join(PACKAGE_ROOT, "skills-override");

/** Harness-owned skills whose names must win every collision. */
export function getSkillsOverrideDir(): string {
  return SKILLS_OVERRIDE_DIR;
}

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
 * override (harness skills) > third-party extension entrypoints
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
  const paths: string[] = [...getPiPackageExtensionPaths()];
  if (override) paths.unshift(override);
  paths.push(...firstParty);
  return paths;
}
