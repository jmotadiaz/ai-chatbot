import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** Isolated `build:verify` output of the chatbot, relative to the package root. */
export const VERIFY_STATIC_DIR = path.join(".next", "verify", "static");

/** Secrets literals that must never reach the browser, independent of config files. */
const HARDCODED_SECRET_LITERALS = ["5435/prod", "******localhost:5435/prod"];

export type BundleInspection =
  | { status: "missing"; staticDir: string }
  | { status: "stale"; staticDir: string; staleFiles: string[]; freshSince: number }
  | { status: "leaks"; staticDir: string; filesInspected: number; leaks: BundleLeak[] }
  | {
      status: "inspected";
      staticDir: string;
      filesInspected: number;
      literalsChecked: number;
      freshnessChecked: boolean;
    };

export interface BundleLeak {
  file: string;
  literal: string;
}

export interface InspectClientBundleOptions {
  staticDir: string;
  secretLiterals: readonly string[];
  /**
   * When set, every `.js` chunk must have been written at or after this epoch
   * millisecond. Used by full verification to reject a bundle left over from a
   * previous build.
   */
  freshSince?: number;
}

function collectJsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectJsFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(full);
  }
  return files;
}

/** Generic words and non-secrets that must not be treated as leaked secret literals. */
const IGNORED_SECRET_LITERALS = new Set(["postgres", "localhost", "127.0.0.1", "true", "false"]);

/**
 * Reads the production secrets module or root .env and returns the literal values that
 * must not appear in client chunks. Missing file → only the hardcoded literals.
 */
export function loadSecretLiterals(secretsPath?: string): string[] {
  const literals = [...HARDCODED_SECRET_LITERALS];
  const fileToRead = secretsPath ?? path.resolve(__dirname, "../../..", ".env");
  if (existsSync(fileToRead)) {
    const source = readFileSync(fileToRead, "utf8");
    for (const match of source.matchAll(/:\s*"([^"]+)"/g)) {
      const value = match[1];
      if (value && value.length > 5 && !IGNORED_SECRET_LITERALS.has(value.toLowerCase())) {
        literals.push(value);
      }
    }
    for (const match of source.matchAll(/^([A-Z0-9_]+)=\s*"?([^"\r\n]+)"?/gm)) {
      const key = match[1];
      const value = match[2]?.trim();
      if (key === "POSTGRES_USER") continue;
      if (
        value &&
        value.length > 5 &&
        !value.startsWith("replace-") &&
        !IGNORED_SECRET_LITERALS.has(value.toLowerCase())
      ) {
        literals.push(value);
      }
    }
  }
  return literals;
}

export function inspectClientBundle(options: InspectClientBundleOptions): BundleInspection {
  const { staticDir, secretLiterals, freshSince } = options;
  const jsFiles = collectJsFiles(staticDir);
  if (jsFiles.length === 0) return { status: "missing", staticDir };

  if (freshSince !== undefined) {
    const staleFiles = jsFiles
      .filter((file) => statSync(file).mtimeMs < freshSince)
      .map((file) => path.relative(staticDir, file));
    if (staleFiles.length > 0) {
      return { status: "stale", staticDir, staleFiles, freshSince };
    }
  }

  const leaks: BundleLeak[] = [];
  for (const file of jsFiles) {
    const content = readFileSync(file, "utf8");
    for (const literal of secretLiterals) {
      if (content.includes(literal)) {
        leaks.push({ file: path.relative(staticDir, file), literal: literal.slice(0, 10) + "..." });
      }
    }
  }
  if (leaks.length > 0) {
    return { status: "leaks", staticDir, filesInspected: jsFiles.length, leaks };
  }
  return {
    status: "inspected",
    staticDir,
    filesInspected: jsFiles.length,
    literalsChecked: secretLiterals.length,
    freshnessChecked: freshSince !== undefined,
  };
}

export type VerifyMode = "fast" | "full";

export interface BuildOutcome {
  ok: boolean;
  detail: string;
}

export interface VerifyClientBundleOptions {
  mode: VerifyMode;
  staticDir: string;
  secretLiterals: readonly string[];
  /** Runs the isolated `build:verify`. Only consulted in full mode. */
  runBuild: () => BuildOutcome;
  now?: () => number;
  log: (line: string) => void;
}

/**
 * Exit code 0 only for a passing inspection. Fast mode with an absent artifact
 * returns 0 but says `NOT INSPECTED` explicitly: it is not a satisfactory result.
 * Full mode never inspects unless the build it ran succeeded, and requires every
 * chunk to be newer than the build start.
 */
export function verifyClientBundle(options: VerifyClientBundleOptions): number {
  const { mode, staticDir, secretLiterals, runBuild, log } = options;
  const now = options.now ?? Date.now;

  let freshSince: number | undefined;
  if (mode === "full") {
    freshSince = now();
    log("[verify:bundle] running isolated build:verify before inspection");
    const build = runBuild();
    if (!build.ok) {
      log(`[verify:bundle] FAILED: build:verify failed (${build.detail}); bundle not inspected`);
      return 1;
    }
  }

  const result = inspectClientBundle({ staticDir, secretLiterals, freshSince });
  switch (result.status) {
    case "missing":
      if (mode === "fast") {
        log(
          `[inspect:bundle] NOT INSPECTED: no client bundle at ${result.staticDir}. ` +
            "Run `pnpm --filter chatbot build:verify` or `pnpm verify:full` to inspect it.",
        );
        return 0;
      }
      log(`[verify:bundle] FAILED: no client bundle produced at ${result.staticDir}`);
      return 1;
    case "stale":
      log(
        `[verify:bundle] FAILED: ${result.staleFiles.length} chunk(s) in ${result.staticDir} ` +
          `predate the build (stale): ${result.staleFiles.slice(0, 5).join(", ")}`,
      );
      return 1;
    case "leaks":
      for (const leak of result.leaks) {
        log(`[${mode === "full" ? "verify" : "inspect"}:bundle] LEAK ${leak.literal} in ${leak.file}`);
      }
      log(`[${mode === "full" ? "verify" : "inspect"}:bundle] FAILED: secrets found in client chunks`);
      return 1;
    case "inspected": {
      const freshness = result.freshnessChecked
        ? "all chunks newer than the build start"
        : "freshness NOT evaluated (fast mode)";
      log(
        `[${mode === "full" ? "verify" : "inspect"}:bundle] OK: ${result.filesInspected} chunk(s) ` +
          `inspected against ${result.literalsChecked} literal(s); ${freshness}`,
      );
      return 0;
    }
  }
}
