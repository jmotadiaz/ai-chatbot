import path from "node:path";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
  /**
   * Strip the `pi.skills` manifest entry from the checked-out package.json.
   *
   * Package-declared skills are loaded by the SDK's `resourceLoader.reload()`
   * BEFORE any extension `resources_discover` hook, and loadSkills resolves
   * same-name skills first-wins — so a manifest-declared `brainstorming`
   * always beats `skills-override/brainstorming`. Stripping the entry makes
   * the package's skills arrive only through its extension's
   * `resources_discover`, which the SDK loads in extension order with the
   * harness override first. See `scripts/install-packages.ts`.
   */
  stripManifestSkills?: boolean;
}

export const PI_PACKAGES: PiPackage[] = [
  {
    name: "superpowers",
    repo: "https://github.com/obra/superpowers.git",
    defaultRef: "v6.2.0",
    refEnvVar: "CODING_AGENT_SUPERPOWERS_REF",
    // superpowers declares pi.skills AND its extension registers the same
    // skills dir via resources_discover; the manifest entry must go so the
    // harness skills-override wins the brainstorming name collision.
    stripManifestSkills: true,
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

/**
 * Remove the `pi.skills` entry from a checked-out package manifest. Returns
 * true when the file was modified, false when there was nothing to strip.
 * The package's skills then reach sessions only through its extension's
 * `resources_discover` hook, which the SDK loads after the harness override
 * extension — so `skills-override/` wins same-name collisions (loadSkills
 * keeps the first skill that claims a name).
 */
export function removePiSkillsFromManifest(packageJsonPath: string): boolean {
  const manifest = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  if (!manifest.pi || !Array.isArray(manifest.pi.skills)) return false;
  delete manifest.pi.skills;
  writeFileSync(packageJsonPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return true;
}

/**
 * Apply the manifest patch for a package's checkout dir (see
 * `PiPackage.stripManifestSkills`). Called by `scripts/install-packages.ts`
 * after every install, skipped or not, so existing checkouts get patched too.
 * Never throws: a patch failure must not block worker startup — it only
 * means the package's skills keep shadowing the harness override.
 */
export function applyManifestSkillPatches(pkg: PiPackage, checkoutDir: string): void {
  if (!pkg.stripManifestSkills) return;
  const manifestPath = path.join(checkoutDir, "package.json");
  if (!existsSync(manifestPath)) return;
  try {
    if (removePiSkillsFromManifest(manifestPath)) {
      console.log(
        `pi package manifest patched: ${pkg.name} — pi.skills stripped so its skills load via resources_discover after the harness override`,
      );
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(
      `pi package manifest patch failed for ${pkg.name} — its skills may shadow skills-override\n${detail}`,
    );
  }
}
