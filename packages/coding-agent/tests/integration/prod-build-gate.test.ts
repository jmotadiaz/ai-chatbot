import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

/**
 * The worker's ALLOW_PROD_BUILD gate (ticket 07): build:prod writes dist/ and
 * regenerates .pi-prod/models.json (prod runtime state); without opt-in it
 * must die before compiling anything. build:prod:verify does not go through
 * here.
 */
const exec = promisify(execFile);
const PACKAGE_ROOT = path.resolve(import.meta.dirname, "../..");

async function runGate(extra: Record<string, string | undefined>) {
  const env = { ...process.env, ALLOW_PROD_BUILD: undefined, ...extra };
  try {
    const { stdout } = await exec("npx", ["tsx", "scripts/assert-prod-build-allowed.ts"], {
      cwd: PACKAGE_ROOT,
      env,
      timeout: 60_000,
    });
    return { code: 0, output: stdout };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

describe("worker assert-prod-build-allowed", () => {
  it("passes with ALLOW_PROD_BUILD=1", async () => {
    expect((await runGate({ ALLOW_PROD_BUILD: "1" })).code).toBe(0);
  }, 60_000);

  it("fails without opt-in and points to build:verify", async () => {
    const { code, output } = await runGate({});
    expect(code).not.toBe(0);
    expect(output).toMatch(/build:verify/);
    expect(output).toMatch(/ALLOW_PROD_BUILD/);
  }, 60_000);
});
