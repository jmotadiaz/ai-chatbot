import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  PHASE_PRODUCTION_BUILD,
  PHASE_DEVELOPMENT_SERVER,
} from "next/constants";
import { describe, expect, it, vi } from "vitest";

/**
 * Contrato del enlace estático del Entorno (ADR 0011 §4.2, ticket 03):
 *
 * 1. `next.config.ts` NO lee `process.argv` (el Entorno activo se lo da el
 *    launcher `scripts/next-cli.ts` vía `initConfig` en el MISMO proceso) y
 *    solo toca UN `process.env.*`: `NEXT_CLI_VERIFY`, la señal IPC
 *    launcher→workers de `--verify` (Next re-evalúa el config en workers de
 *    jest-worker con estado de módulo nuevo; ver comentario en next.config).
 * 2. `turbopack.resolveAlias` y `webpack.resolve.alias` redirigen `"config"`
 *    DIRECTAMENTE al bundle estático del Entorno activo
 *    (`packages/config/src/env.<entorno>.ts`), sin shims intermedios.
 * 3. Ese bundle exporta la fachada `config` SOLDADA a su Entorno y la
 *    superficie isomorfa completa del paquete (`surface.ts`).
 *
 * En los tests el Entorno es test (initConfig + alias), así que el Entorno
 * activo esperado es `"test"`.
 */
const PACKAGE_ROOT = path.resolve(__dirname, "../..");

async function loadActiveNextConfig() {
  const mod = await import("@/next.config");
  expect(typeof mod.default).toBe("function");
  return mod.default(PHASE_DEVELOPMENT_SERVER);
}

describe("next.config alias del Entorno", () => {
  it("no lee process.argv; de process.env solo NEXT_CLI_VERIFY (IPC con workers)", () => {
    const source = readFileSync(path.join(PACKAGE_ROOT, "next.config.ts"), "utf8");
    // Comentarios fuera: documentan el "no process.env/argv" permitido.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(code).not.toContain("process.argv");
    // Aquí NO hay selector de Entorno (NEXT_PUBLIC_ENV/APP_ENV), rutas ni
    // credenciales por env: solo el flag de aislamiento del launcher.
    const envReads = [...code.matchAll(/process\.env\.[A-Z_0-9]+/g)].map(
      (match) => match[0],
    );
    expect(new Set(envReads)).toEqual(
      new Set(["process.env.NEXT_CLI_VERIFY"]),
    );
  });

  it("IPC --verify: un worker con módulos frescos rehidrata flags y acuerda .next/verify", async () => {
    // Simula la re-evaluación del config en un worker de jest-worker: módulos
    // nuevos (sin setBuildFlags del launcher) + NEXT_CLI_VERIFY heredado.
    vi.resetModules();
    const previous = process.env.NEXT_CLI_VERIFY;
    process.env.NEXT_CLI_VERIFY = "1";
    try {
      const mod = await import("@/next.config");
      const config = mod.default(PHASE_PRODUCTION_BUILD);
      expect(config.distDir).toBe(".next/verify");
    } finally {
      if (previous === undefined) delete process.env.NEXT_CLI_VERIFY;
      else process.env.NEXT_CLI_VERIFY = previous;
      vi.resetModules();
    }
  });

  it("turbopack.resolveAlias y webpack.resolve.alias apuntan al bundle del Entorno activo", async () => {
    // Turbopack: specifier `@/…` (paths de tsconfig) + `../` hasta
    // packages/config — una ruta absoluta `/…` sería "server relative" y no
    // está soportada. Webpack: ruta absoluta al mismo módulo.
    const expectedFile = path.join(PACKAGE_ROOT, "..", "config", "src", "env.test.ts");

    const config = await loadActiveNextConfig();
    expect(config.turbopack?.resolveAlias?.config).toBe("@/../config/src/env.test");
    expect(config.turbopack?.resolveAlias?.["config/contract"]).toBe(
      "@/../config/src/gateway-contract",
    );
    expect(existsSync(expectedFile)).toBe(true);

    // El alias de Webpack se calcula al invocar la fábrica, conservando los
    // aliases previos que inyecta Next.
    const withExisting = config.webpack!(
      { resolve: { alias: { "next/internal": "kept" } } } as never,
      {} as never,
    );
    expect(withExisting.resolve?.alias).toMatchObject({
      "next/internal": "kept",
      config: expectedFile,
      "config/contract": path.join(PACKAGE_ROOT, "..", "config", "src", "gateway-contract.ts"),
    });

    // En el build de cliente de Webpack (isServer: false), config resuelve a false
    // para impedir cualquier fuga de secretos al navegador.
    const clientWebpack = config.webpack!(
      { resolve: { alias: {} } } as never,
      { isServer: false } as never,
    );
    expect(clientWebpack.resolve?.alias).toMatchObject({
      config: false,
      "config/contract": path.join(PACKAGE_ROOT, "..", "config", "src", "gateway-contract.ts"),
    });
  });

  it("el bundle del Entorno exporta la fachada soldada + la superficie completa del paquete", async () => {
    const bundlePath = path.join(PACKAGE_ROOT, "..", "config", "src", "env.test.ts");
    const shim = (await import(bundlePath)) as Record<string, unknown>;

    // Fachada soldada al bundle del Entorno activo (test): debe ser la
    // fachada ESTÁTICA de env.test, nunca la fachada-selector de index
    // (prueba de que la exportación explícita prevalece sobre `export *`,
    // la precedencia ES que el shim documenta).
    const facade = shim.config as { entorno: () => string; port: () => number };
    expect(typeof facade.entorno).toBe("function");
    expect(facade.entorno()).toBe("test");
    expect(facade.port()).toBe(3001);

    const selectorMod = (await import(
      path.join(PACKAGE_ROOT, "../config/src/index")
    )) as Record<string, unknown>;
    const bundleMod = (await import(
      path.join(PACKAGE_ROOT, "../config/src/env.test")
    )) as Record<string, unknown>;
    expect(shim.config).toBe(bundleMod.config);
    expect(shim.config).not.toBe(selectorMod.config);

    // Superficie que el código del chatbot importa de `"config"` además de la
    // fachada: el bundle la re-exporta desde `surface.ts`.
    expect(typeof shim.optional).toBe("function");
    expect(typeof shim.EMBEDDING_DIMENSIONS).toBe("number");
    expect(Array.isArray(shim.GATEWAY_THINKING_LEVELS)).toBe(true);
    expect(typeof shim.setBuildFlags).toBe("function");
  });
});
