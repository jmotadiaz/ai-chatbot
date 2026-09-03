import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

/**
 * Gate ALLOW_PROD_BUILD del worker (ticket 07): build:prod escribe dist/ y
 * regenera .pi-prod/models.json (estado de runtime de Producción); sin opt-in
 * debe morir antes de compilar nada. build:prod:verify no pasa por aquí.
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

describe("assert-prod-build-allowed del worker", () => {
  it("pasa con ALLOW_PROD_BUILD=1", async () => {
    expect((await runGate({ ALLOW_PROD_BUILD: "1" })).code).toBe(0);
  }, 60_000);

  it("falla sin opt-in y dirige a build:verify", async () => {
    const { code, output } = await runGate({});
    expect(code).not.toBe(0);
    expect(output).toMatch(/build:verify/);
    expect(output).toMatch(/ALLOW_PROD_BUILD/);
  }, 60_000);
});
