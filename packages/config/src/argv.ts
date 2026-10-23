import { ConfigError } from "./errors";
import { packagePath } from "./paths";
import type { Entorno } from "./types";

/**
 * Parseo de `process.argv` (ADR 0011 §3.5) y ruta del bundle del Entorno.
 *
 * Este módulo NO importa los bundles `env.<env>.ts`, así que forma parte de la
 * superficie isomorfa (`surface.ts`) y los bundles del Entorno lo re-exportan:
 * los scripts y configs que se cargan en el MISMO proceso que el alias
 * (`next.config.ts`, `scripts/next-cli.ts` bajo vitest) siguen viendo estas
 * funciones aunque `"config"` esté enlazado a `env.<entorno>.ts`.
 */

export const ENTORNOS: readonly Entorno[] = ["prod", "dev", "test"];

export function isEntorno(value: string): value is Entorno {
  return (ENTORNOS as readonly string[]).includes(value);
}

/**
 * Entorno declarado con `--env=<entorno>` (o `--env <entorno>`). Devuelve
 * `undefined` si el flag no está; lanza `ConfigError` si el valor no es válido
 * — un flag mal escrito jamás debe caer silenciosamente al Entorno por defecto.
 */
export function parseEntornoFromArgv(
  argv: readonly string[] = process.argv,
): Entorno | undefined {
  let found: Entorno | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    let raw: string | undefined;
    if (arg === "--env") raw = argv[index + 1];
    else if (arg.startsWith("--env=")) raw = arg.slice("--env=".length);
    if (raw === undefined) continue;
    if (!isEntorno(raw)) {
      throw new ConfigError(
        "--env",
        `valor "${raw}" no válido; se esperaba --env=prod|dev|test`,
      );
    }
    found = raw;
  }
  return found;
}

/** Flags de build presentes en argv (`--verify`, `--allow-prod-build`). */
export function parseBuildFlagsFromArgv(argv: readonly string[] = process.argv): {
  verifyBuild: boolean;
  allowProdBuild: boolean;
} {
  return {
    verifyBuild: argv.includes("--verify"),
    allowProdBuild: argv.includes("--allow-prod-build"),
  };
}

/**
 * Detección automática del runner de test: `npx vitest` o `npx playwright`
 * lanzados a mano en cualquier cwd también deben correr SIEMPRE en test.
 * (Los `vitest.config.ts` además llaman a `initConfig("test")`: los workers de
 * Vitest no conservan el argv del binario, así que la detección es una red de
 * seguridad para el proceso principal.)
 */
export function detectTestRunner(argv: readonly string[] = process.argv): Entorno | undefined {
  const isRunner = argv.some((arg) => {
    const normalized = arg.replace(/\\/g, "/");
    return (
      /(^|\/)vitest(\.mjs|\.js)?$/.test(normalized) ||
      normalized.includes("@playwright/test") ||
      /(^|\/)playwright(\.mjs|\.js)?$/.test(normalized)
    );
  });
  return isRunner ? "test" : undefined;
}

/**
 * Ruta del módulo del Entorno. La consumen `next.config.ts` (alias de
 * Turbopack/Webpack) y los `vitest.config.ts` para enlazar `"config"` al
 * bundle estático sin leer `process.env`.
 */
export function envBundlePath(entorno: Entorno): string {
  return packagePath("config", "src", `env.${entorno}.ts`);
}
