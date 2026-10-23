import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

/**
 * Gate ALLOW_PROD_BUILD (ticket 06; migrado a `--allow-prod-build` por argv
 * en ADR 0011, ticket 03): `build:prod` escribe al `.next` que sirve prod
 * bajo pm2, así que exige opt-in explícito del operador/CI. El agente verifica
 * compilación con `build:verify`, que NO lo requiere.
 * Se ejercita el script real como proceso (contrato de exit code + mensaje),
 * tanto por process.argv (vía canónica) como por el env transitorio.
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

describe("assert-prod-build-allowed (gate de build:prod)", () => {
  it("pasa con --allow-prod-build por process.argv (vía canónica, ADR 0011)", async () => {
    const { code } = await runGate({}, ["--allow-prod-build"]);
    expect(code).toBe(0);
  }, 60_000);

  it("pasa con ALLOW_PROD_BUILD=1 (transición: scripts actuales/CI)", async () => {
    const { code } = await runGate({ ALLOW_PROD_BUILD: "1" });
    expect(code).toBe(0);
  }, 60_000);

  it("falla sin opt-in y dirige a build:verify", async () => {
    const { code, output } = await runGate({});
    expect(code).not.toBe(0);
    expect(output).toMatch(/build:verify/);
    expect(output).toMatch(/ALLOW_PROD_BUILD/);
  }, 60_000);

  it("falla con valores que no son el truthy exacto (0/true/yes)", async () => {
    for (const value of ["0", "true", "yes"]) {
      const { code } = await runGate({ ALLOW_PROD_BUILD: value });
      expect(code, `ALLOW_PROD_BUILD=${value} no debe autorizar`).not.toBe(0);
    }
  }, 90_000);
});
