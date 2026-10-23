import { afterEach, describe, expect, it, vi } from "vitest";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

/**
 * Contrato de `next.config.ts` (tickets 01/03, ADR 0011):
 *
 * - `distDir` lo decide `config.nextBuildDir()`: `.next` por defecto y
 *   `.next/verify` cuando el launcher fija el flag `--verify` vía
 *   `initConfig(env, { verifyBuild })` (ADR 0006). El antiguo selector
 *   `NEXT_BUILD_DIR` por variable de entorno murió en el ticket 01.
 * - `next.config.ts` NO lee `process.argv` ni `process.env`: el Entorno activo
 *   se lo da el proceso del launcher (mismo proceso, `initConfig` ya llamado).
 */
async function loadNextConfig(options: { verifyBuild?: boolean } = {}) {
  vi.resetModules();
  // Mismo grafo de módulos que usará `@/next.config` (alias `"config"` →
  // shim de test): los flags de build viven en `facade.ts`, compartido.
  const cfg = await import("config");
  cfg.setBuildFlags({
    verifyBuild: options.verifyBuild ?? false,
    allowProdBuild: false,
  });
  const mod = await import("@/next.config");
  const factory = mod.default;
  expect(typeof factory).toBe("function");
  return factory(PHASE_DEVELOPMENT_SERVER);
}

describe("next.config distDir aislable", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("sin --verify construye en .next (default canónico)", async () => {
    expect((await loadNextConfig()).distDir).toBe(".next");
  });

  it("con --verify (flag de build) construye en el directorio aislado", async () => {
    expect((await loadNextConfig({ verifyBuild: true })).distDir).toBe(
      ".next/verify",
    );
  });

  it("NEXT_BUILD_DIR ya NO es canal de configuración (murió en el ticket 01)", async () => {
    process.env.NEXT_BUILD_DIR = ".next/verify";
    try {
      expect((await loadNextConfig()).distDir).toBe(".next");
    } finally {
      delete process.env.NEXT_BUILD_DIR;
    }
  });
});
