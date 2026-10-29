#!/usr/bin/env tsx
/**
 * Client bundle secrets inspection (ADR 0013).
 *
 * Usage: `tsx scripts/verify-client-bundle.ts --mode=fast|full`
 *   - fast: inspects `.next/verify/static` if present; reports NOT INSPECTED when absent.
 *   - full: runs `pnpm build:verify` first, then requires a fresh, satisfactory inspection.
 *
 * Never builds Production: only the isolated `build:verify` is spawned.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  VERIFY_STATIC_DIR,
  loadSecretLiterals,
  verifyClientBundle,
  type VerifyMode,
} from "./client-bundle";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseMode(args: readonly string[]): VerifyMode {
  const raw = args.find((arg) => arg.startsWith("--mode="))?.slice("--mode=".length);
  if (raw === "fast" || raw === "full") return raw;
  console.error("usage: verify-client-bundle.ts --mode=fast|full");
  process.exit(2);
}

function runBuildVerify(): { ok: boolean; detail: string } {
  const result = spawnSync("pnpm", ["build:verify"], { cwd: packageRoot, stdio: "inherit" });
  if (result.error) return { ok: false, detail: result.error.message };
  if (result.status !== 0) return { ok: false, detail: `exit ${result.status ?? "signal"}` };
  return { ok: true, detail: "exit 0" };
}

try {
  const exitCode = verifyClientBundle({
    mode: parseMode(process.argv.slice(2)),
    staticDir: path.join(packageRoot, VERIFY_STATIC_DIR),
    secretLiterals: loadSecretLiterals(
      path.join(packageRoot, "..", "config", "src", "secrets.prod.ts"),
    ),
    runBuild: runBuildVerify,
    log: (line) => console.log(line),
  });
  process.exitCode = exitCode;
} catch (error) {
  console.error(`[verify:bundle] ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
