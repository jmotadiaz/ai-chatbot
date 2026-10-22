import { ConfigError } from "./errors";
import { envDev } from "./env.dev";
import { envProd } from "./env.prod";
import { envTest } from "./env.test";
import { createConfigFacade, setBuildFlags } from "./facade";
import { packagePath } from "./paths";
import type { AppConfig, Entorno } from "./types";

/**
 * Selector de Entorno y fachada `config` (ADR 0011 §3.5).
 *
 * El Entorno activo se resuelve SIN leer ninguna variable de `process.env`:
 *
 * 1. `initConfig(entorno, options?)` — inicialización explícita en memoria.
 *    La usan `vitest.config.ts`, `playwright.config.ts` y `scripts/next-cli.ts`.
 * 2. `--env=prod|dev|test` en `process.argv`. A diferencia de una variable de
 *    entorno, `process.argv` pertenece SOLO al proceso invocado: el kernel no
 *    lo propaga en `fork()`/`execve()`, así que ningún subproceso que lance el
 *    Coding Agent Worker (p. ej. `pnpm test`) puede heredar el Entorno del
 *    worker padre. De ahí el incidente que motiva ADR 0011.
 * 3. Detección del runner de test en `process.argv` (`vitest`, `@playwright/test`).
 * 4. `ConfigError` de fallo rápido.
 *
 * Los bundles `env.<env>.ts` están congelados y validados por los guardarraíles
 * de coherencia. En Next.js el import `"config"` se sustituye en tiempo de
 * compilación por el bundle de su Entorno (`next.config.ts` → `resolveAlias`),
 * así que el código compilado no depende de este selector.
 */

export const ENTORNOS: readonly Entorno[] = ["prod", "dev", "test"];

const BUNDLES: Record<Entorno, AppConfig> = {
  prod: envProd,
  dev: envDev,
  test: envTest,
};

export interface InitConfigOptions {
  /** `build:verify`: aísla los artefactos de compilación (`.next/verify`, `.pi-verify`). */
  verifyBuild?: boolean;
  /** `build`: opt-in explícito del operador/CI para pisar los artefactos de prod. */
  allowProdBuild?: boolean;
  /** argv a parsear (por defecto `process.argv`); inyectable en tests. */
  argv?: readonly string[];
}

let activeBundle: AppConfig | undefined;

function isEntorno(value: string): value is Entorno {
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
 * Fija el Entorno activo en memoria. La última inicialización explícita gana
 * (los tests pueden re-inicializar). También fija los flags de compilación, que
 * el bundle estático enlazado por el bundler consulta vía `facade.ts`.
 */
export function initConfig(entorno: Entorno, options: InitConfigOptions = {}): void {
  if (!isEntorno(entorno)) {
    throw new ConfigError("initConfig", `Entorno "${String(entorno)}" no válido`);
  }
  const argv = options.argv ?? process.argv;
  const flags = parseBuildFlagsFromArgv(argv);
  setBuildFlags({
    verifyBuild: options.verifyBuild ?? flags.verifyBuild,
    allowProdBuild: options.allowProdBuild ?? flags.allowProdBuild,
  });
  activeBundle = BUNDLES[entorno];
}

/** Test hook: olvida el Entorno activo para volver a resolver desde argv. */
export function resetConfigForTests(): void {
  activeBundle = undefined;
}

function resolveBundle(): AppConfig {
  if (activeBundle) return activeBundle;
  const argv = process.argv;
  const entorno = parseEntornoFromArgv(argv) ?? detectTestRunner(argv);
  if (!entorno) {
    throw new ConfigError(
      "--env",
      "Missing required CLI flag --env=prod|dev|test " +
        "(process.argv is the only environment selector; see ADR 0011)",
    );
  }
  initConfig(entorno, { argv });
  if (!activeBundle) {
    throw new ConfigError("--env", "no se pudo resolver el Entorno activo");
  }
  return activeBundle;
}

/**
 * Ruta del módulo del Entorno activo. La consumen `next.config.ts` (alias de
 * Turbopack/Webpack) y los `vitest.config.ts` para enlazar `"config"` al
 * bundle estático sin leer `process.env`.
 */
export function envBundlePath(entorno: Entorno): string {
  return packagePath("config", "src", `env.${entorno}.ts`);
}

/**
 * Fachada funcional congelada del Entorno activo: mantiene la API histórica
 * (`config.postgresUrl()`, `config.codingAgentAuthJson()`, …) sobre el bundle
 * resuelto por `initConfig()`/`--env`, de modo que los ~50 puntos de llamada
 * del monorepo no cambian.
 */
export const config = createConfigFacade(resolveBundle);

/** Convierte un acceso throwing en `undefined` (compatibilidad histórica). */
export function optional<T>(get: () => T): T | undefined {
  try {
    return get();
  } catch {
    return undefined;
  }
}
