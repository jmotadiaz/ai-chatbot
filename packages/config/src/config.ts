import {
  detectTestRunner,
  isEntorno,
  parseBuildFlagsFromArgv,
  parseEntornoFromArgv,
} from "./argv";
import { ConfigError } from "./errors";
import { envDev } from "./env.dev";
import { envProd } from "./env.prod";
import { envTest } from "./env.test";
import { createConfigFacade, setBuildFlags } from "./facade";
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
 * Fachada funcional congelada del Entorno activo: mantiene la API histórica
 * (`config.postgresUrl()`, `config.codingAgentAuthJson()`, …) sobre el bundle
 * resuelto por `initConfig()`/`--env`, de modo que los ~50 puntos de llamada
 * del monorepo no cambian.
 */
export const config = createConfigFacade(resolveBundle);
