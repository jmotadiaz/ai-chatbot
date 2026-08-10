import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  PI_PACKAGES,
  getPiPackagePath,
  getPiPackageRef,
  type PiPackage,
} from "../src/pi-packages";

/**
 * Clones the Pi packages the worker loads into `.pi/packages/`, pinned to the
 * ref declared in `src/pi-packages.ts`. Runs before every worker start, so it
 * has to be idempotent and cheap: the installed ref is recorded in a marker
 * file and a checkout already on that ref is left untouched, without hitting
 * the network.
 *
 * Pass `--force` to re-fetch even when the marker matches, which is how a
 * moving ref (a branch instead of a tag) gets updated.
 */
const REF_MARKER = ".pi-package-ref";

function git(args: string[], cwd?: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trim();
}

function installedRef(dir: string): string | undefined {
  const marker = path.join(dir, REF_MARKER);
  if (!existsSync(marker)) return undefined;
  return readFileSync(marker, "utf-8").trim();
}

function install(pkg: PiPackage, force: boolean): "skipped" | "cloned" | "updated" {
  const dir = getPiPackagePath(pkg);
  const ref = getPiPackageRef(pkg);

  if (!existsSync(path.join(dir, ".git"))) {
    mkdirSync(path.dirname(dir), { recursive: true });
    git(["clone", "--depth", "1", "--branch", ref, pkg.repo, dir]);
    writeFileSync(path.join(dir, REF_MARKER), `${ref}\n`);
    return "cloned";
  }

  if (!force && installedRef(dir) === ref) {
    return "skipped";
  }

  git(["fetch", "--depth", "1", "origin", ref], dir);
  git(["reset", "--hard", "FETCH_HEAD"], dir);
  writeFileSync(path.join(dir, REF_MARKER), `${ref}\n`);
  return "updated";
}

const force = process.argv.includes("--force");

for (const pkg of PI_PACKAGES) {
  const dir = getPiPackagePath(pkg);
  const ref = getPiPackageRef(pkg);
  try {
    const result = install(pkg, force);
    if (result !== "skipped") {
      console.log(`pi package ${result}: ${pkg.name}@${ref} -> ${dir}`);
    }
  } catch (error) {
    // Never block worker startup on a package install: GitHub being
    // unreachable should degrade the session, not stop it from starting.
    const detail = error instanceof Error ? error.message : String(error);
    const state = existsSync(dir)
      ? "keeping the existing checkout"
      : "the worker starts without its skills and extensions";
    console.warn(`pi package install failed: ${pkg.name}@${ref} — ${state}\n${detail}`);
  }
}
