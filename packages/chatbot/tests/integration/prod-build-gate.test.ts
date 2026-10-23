import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

/**
 * ALLOW_PROD_BUILD gate (ticket 06; migrated to `--allow-prod-build` by argv in
 * ADR 0011, ticket 03): `build:prod` writes to the `.next` that prod serves
 * under pm2, so it requires an explicit opt-in from the operator/CI. The agent
 * checks compilation with `build:verify`, which does NOT require it.
 * The real script is exercised as a process (exit code + message contract),
 * both through process.argv (canonical path) and through the transitional env.
 */
const exec = promisify(execFile);
const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const GATE = "scripts/assert-prod-build-allowed.ts";

async function runGate(
  env: Record<string, string | undefined>,
  args: string[] = [],
) {
  const child = exec(
    "npx",
    ["tsx", GATE, ...args],
    { cwd: PACKAGE_ROOT, env: { ...process.env, ...strip(env) }, timeout: 60_000 },
  );
  try {
    const { stdout } = await child;
    return { code: 0, output: stdout };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

function strip(extra: Record<string, string | undefined>) {
  const out: Record<string, string | undefined> = { ...extra };
  if (!("ALLOW_PROD_BUILD" in out)) out.ALLOW_PROD_BUILD = undefined;
  return out;
}

describe("assert-prod-build-allowed (build:prod gate)", () => {
  it("passes with --allow-prod-build via process.argv (canonical path, ADR 0011)", async () => {
    const { code } = await runGate({}, ["--allow-prod-build"]);
    expect(code).toBe(0);
  }, 60_000);

  it("passes with ALLOW_PROD_BUILD=1 (transition: current scripts/CI)", async () => {
    const { code } = await runGate({ ALLOW_PROD_BUILD: "1" });
    expect(code).toBe(0);
  }, 60_000);

  it("fails without opt-in and points to build:verify", async () => {
    const { code, output } = await runGate({});
    expect(code).not.toBe(0);
    expect(output).toMatch(/build:verify/);
    expect(output).toMatch(/ALLOW_PROD_BUILD/);
  }, 60_000);

  it("fails with values that are not the exact truthy (0/true/yes)", async () => {
    for (const value of ["0", "true", "yes"]) {
      const { code } = await runGate({ ALLOW_PROD_BUILD: value });
      expect(code, `ALLOW_PROD_BUILD=${value} must not authorize`).not.toBe(0);
    }
  }, 90_000);
});
