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
   * package root.
   */
  extensionEntrypoints: string[];
}

export const PI_PACKAGES: PiPackage[] = [];

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
 * First-party extensions live inside the package (`extensions/<name>/index.ts`)
 * instead of `PI_PACKAGES`, which is reserved for pinned third-party git
 * checkouts.
 */
const FIRST_PARTY_EXTENSIONS_DIR = path.join(PACKAGE_ROOT, "extensions");

/**
 * Built-in skills directory (`skills/`).
 * Standalone skills that require no TypeScript entrypoint or runtime hooks.
 */
export const BUILTIN_SKILLS_DIR = path.join(PACKAGE_ROOT, "skills");

/** Built-in skill dirs for `additionalSkillPaths` (standalone skills under `skills/`). */
export function getBuiltinSkillPaths(): string[] {
  if (!existsSync(BUILTIN_SKILLS_DIR)) return [];
  return [BUILTIN_SKILLS_DIR];
}

/** First-party extension entrypoints (each `extensions/<name>/index.ts`), e.g. extensions/superpowers, extensions/subagent. */
export function getFirstPartyExtensionPaths(): string[] {
  if (!existsSync(FIRST_PARTY_EXTENSIONS_DIR)) return [];
  return readdirSync(FIRST_PARTY_EXTENSIONS_DIR, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        existsSync(path.join(FIRST_PARTY_EXTENSIONS_DIR, d.name, "index.ts")),
    )
    .map((d) => path.join(FIRST_PARTY_EXTENSIONS_DIR, d.name, "index.ts"))
    .sort();
}

/** First-party skill dirs for `additionalSkillPaths` (needed when extensions are passed as files). */
export function getFirstPartySkillPaths(): string[] {
  if (!existsSync(FIRST_PARTY_EXTENSIONS_DIR)) return [];
  return readdirSync(FIRST_PARTY_EXTENSIONS_DIR, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        existsSync(path.join(FIRST_PARTY_EXTENSIONS_DIR, d.name, "skills")),
    )
    .map((d) => path.join(FIRST_PARTY_EXTENSIONS_DIR, d.name, "skills"))
    .sort();
}

/**
 * All extension paths handed to the Pi resource loader.
 *
 * `includeSubagentExtension: false` excludes the subagent tool — child
 * sessions must not get it (structural anti-recursion, spec §4.2).
 *
 * `includeSuperpowersExtension: false` excludes the superpowers extension —
 * child sessions must not get the superpowers skills or bootstrap either. A
 * subagent executes one specific task from a self-contained brief (see the
 * subagent-driven-development prompts upstream); skill workflows belong to
 * the orchestrating agent alone.
 */
export function getExtensionPaths(options?: {
  includeSubagentExtension?: boolean;
  includeSuperpowersExtension?: boolean;
}): string[] {
  const firstParty = getFirstPartyExtensionPaths().filter((p) => {
    const name = path.basename(path.dirname(p));
    if (options?.includeSubagentExtension === false && name === "subagent")
      return false;
    if (options?.includeSuperpowersExtension === false && name === "superpowers")
      return false;
    return true;
  });
  return [...getPiPackageExtensionPaths(), ...firstParty];
}

/** Filtered skill paths mirroring `getExtensionPaths` (for `additionalSkillPaths`). */
export function getFirstPartySkillPathsFiltered(options?: {
  includeSubagentExtension?: boolean;
  includeSuperpowersExtension?: boolean;
}): string[] {
  return getFirstPartySkillPaths().filter((p) => {
    const name = path.basename(path.dirname(p));
    if (options?.includeSubagentExtension === false && name === "subagent")
      return false;
    if (options?.includeSuperpowersExtension === false && name === "superpowers")
      return false;
    return true;
  });
}
