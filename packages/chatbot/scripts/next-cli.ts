#!/usr/bin/env tsx
/**
 * Micro-launcher de Next.js (ADR 0011 §4.1, spec §4, ticket 03).
 *
 * Uso: `npx tsx scripts/next-cli.ts <dev|build|start> --env=dev|test|prod
 *                  [--port=<n>] [--webpack] [--verify] [--allow-prod-build]`
 *
 * ## Por qué existe este launcher
 *
 * El binario CLI `next` (`next/dist/bin/next`) usa `commander` sin
 * `allowUnknownOption()`: rechaza `--env=...`. Además `next dev`
 * (`next/dist/cli/next-dev.js`) lanza el servidor mediante
 * `child_process.fork(startServerPath)` sin reenviar `process.argv` al hijo.
 * Como ADR 0011 prohíbe seleccionar el Entorno por `process.env` (el kernel lo
 * clona en cada `fork()`/`execve()` — el vector del incidente del 2026-10-22),
 * la única vía fiable es parsear `--env` aquí e `initConfig()` en ESTE mismo
 * proceso, que es el que además evalúa `next.config.ts` y fija el alias
 * `"config"` → `packages/config/src/env.<entorno>.ts` (soldadura estática del
 * Entorno en el bundle; los workers hijos de Next ni siquiera necesitan el
 * selector).
 *
 * ## Tradeoff documentado: APIs internas de Next.js (spec §4.1)
 *
 * Invocamos `startServer` (`next/dist/server/lib/start-server`) y `nextBuild`
 * (`next/dist/cli/next-build`), que NO están cubiertas por semver público:
 * son módulos internos de Next.js (el propio `next/dist/bin/next` los llama
 * así). Al actualizar versiones mayores de Next.js hay que re-verificar
 * ambos entrypoints — lo cubre el test de contrato
 * `tests/contract/next-internals.test.ts` (firma de `StartServerOptions` y
 * `NextBuildOptions` en los `.d.ts`), además de `build --verify`.
 *
 * Replicamos los defaults que aplica `next/dist/bin/next` para `build`
 * (inspeccionado en Next 16.1.1): `mangling: true`
 * (`--no-mangling` lo desactiva), `experimentalBuildMode: "default"` y
 * `experimentalDebugMemoryUsage: false`; el bundler se decide como en el CLI:
 * sin flags, `next` usa Turbopack por defecto (interno `TURBOPACK=auto`).
 *
 * ## Bundler en dev: `process.env.TURBOPACK` es INTERNO de Next, no config
 *
 * El bundler de `dev` no es una opción de Entorno (ADR 0011): lo decide el
 * runtime interno de Next.js leyendo `process.env.TURBOPACK`
 * (`next/dist/lib/bundler#parseBundlerArgs`, `next-dev-server.js`,
 * `start-server.js`). Por eso:
 *
 * - SIN `--webpack` dejamos el comportamiento actual de `next dev`
 *   (Turbopack): `process.env.TURBOPACK ||= "auto"` — exactamente lo que
 *   fija `next dev` sin flags por defecto (equivale al `TURBOPACK=1`
 *   histórico; `"auto"` es el valor que pone `parseBundlerArgs`).
 * - CON `--webpack` garantizamos que `process.env.TURBOPACK` queda falsy
 *   (`delete`) ANTES de `startServer`/`nextBuild`: si el shell arrastrara un
 *   `TURBOPACK` heredado, `parseBundlerArgs` abortaría con "Multiple bundler
 *   flags set" (o arrancaría Turbopack en vez de Webpack). El `webServer` de
 *   Playwright usa `--webpack` porque Turbopack puede atascarse compilando
 *   `/agent/code` bajo Node 24.
 * - Este es el ÚNICO uso de variables de entorno del launcher, y es
 *   deliberadamente ajeno a la configuración de la app: no selecciona
 *   Entorno, puertos ni secretos.
 *
 * ## NODE_ENV
 *
 * `next/dist/bin/next` hace `NODE_ENV ||= "development"|"production"` por
 * comando. Aquí lo fijamos (no solo `||=`): el bloque `env` que Playwright
 * arrastraba para forzar `NODE_ENV=development` desaparece con este ticket, y
 * `next dev` con un `NODE_ENV=production` heredado del shell (contexto pm2)
 * revienta el pipeline CSS. Un build/start con `NODE_ENV` ajeno compilaría
 * además en modo equivocado — el Entorno ya está decidido por argv.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, type Entorno } from "config";
// `initConfig` vive en el selector, que importa los tres bundles: los scripts
// no pasan por el alias del bundler, así que lo importamos por ruta relativa
// para que este módulo siga funcionando aunque `"config"` apunte a
// `env.<entorno>.ts` (p. ej. bajo el alias de vitest).
import { parseEntornoFromArgv } from "../../config/src/argv";
import { initConfig } from "../../config/src/config";

export type NextCliCommand = "dev" | "build" | "start";

export interface NextCliOptions {
  command: NextCliCommand;
  env: Entorno;
  /** `undefined` → `config.port()` del Entorno activo. */
  port?: number;
  /** Fuerza Webpack (dev y build); sin él, Turbopack (default de Next 16). */
  webpack: boolean;
  verifyBuild: boolean;
  allowProdBuild: boolean;
}

export const USAGE = [
  "Uso: npx tsx scripts/next-cli.ts <dev|build|start> --env=<entorno> [opciones]",
  "",
  "Comandos:",
  "  dev     Arranca el servidor de desarrollo (next dev equivalent)",
  "  build   Compila el proyecto (exige --verify o --allow-prod-build)",
  "  start   Sirve el build de producción (next start equivalent)",
  "",
  "Opciones:",
  "  --env=dev|test|prod   Entorno activo (OBLIGATORIO; ADR 0011, por process.argv)",
  "  --port=<n>            Puerto (default: config.port() del Entorno)",
  "  --webpack             Usa Webpack en vez del Turbopack por defecto",
  "  --verify              Build aislado en .next/verify (build:verify, sin gate)",
  "  --allow-prod-build    Opt-in explícito del operador/CI para escribir .next (ADR 0006)",
  "  --help, -h            Esta ayuda",
  "",
  "Ejemplos:",
  "  npx tsx scripts/next-cli.ts dev --env=dev --port=3000",
  "  npx tsx scripts/next-cli.ts dev --env=test --webpack --port=3001",
  "  npx tsx scripts/next-cli.ts build --env=prod --verify",
  "  npx tsx scripts/next-cli.ts start --env=prod --port=8085",
].join("\n");

/** Error de sintaxis de argv: mensaje de un solo uso + USAGE por el caller. */
export class CliUsageError extends Error {}

const COMMANDS: readonly NextCliCommand[] = ["dev", "build", "start"];

function parsePort(raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new CliUsageError(`--port inválido: "${raw}" (entero 1-65535)`);
  }
  return value;
}

/**
 * Parser PURO de los argumentos del launcher (sin efectos: no toca
 * `process.env`, ni `initConfig`, ni importa Next.js — por eso es unit-testable
 * sin cargar el servidor). `args` es `process.argv.slice(2)`.
 *
 * - El Entorno se resuelve con el parser canónico de `config`
 *   (`parseEntornoFromArgv`): `--env=x` o `--env x`, y un valor inválido
 *   lanza `ConfigError` (nunca cae a un Entorno por defecto).
 * - Sin `--env` → `CliUsageError` con la ayuda (ADR 0011: el launcher es el
 *   proceso que debe declarar su Entorno; no existe default silencioso).
 */
export function parseNextCliArgs(args: readonly string[]): NextCliOptions {
  const positionals: string[] = [];
  let port: number | undefined;
  const webpack = args.includes("--webpack");
  const verifyBuild = args.includes("--verify");
  const allowProdBuild = args.includes("--allow-prod-build");

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("-")) {
      positionals.push(arg);
      continue;
    }
    if (
      arg === "--webpack" ||
      arg === "--verify" ||
      arg === "--allow-prod-build"
    ) {
      continue;
    }
    if (arg.startsWith("--port=")) {
      port = parsePort(arg.slice("--port=".length));
      continue;
    }
    if (arg === "--port") {
      const value = args[index + 1];
      if (value === undefined) throw new CliUsageError("--port requiere un valor (--port=<n>)");
      port = parsePort(value);
      index += 1; // el valor no es un positional
      continue;
    }
    if (arg.startsWith("--env=")) continue; // lo resuelve config
    if (arg === "--env") {
      if (args[index + 1] === undefined) {
        throw new CliUsageError("--env requiere un valor (--env=dev|test|prod)");
      }
      index += 1; // el valor lo valida parseEntornoFromArgv (ConfigError si es inválido)
      continue;
    }
    throw new CliUsageError(`argumento desconocido: ${arg}`);
  }

  if (positionals.length === 0) {
    throw new CliUsageError("falta el comando (dev|build|start)");
  }
  if (positionals.length > 1) {
    throw new CliUsageError(`comandos de más: ${positionals.join(" ")}`);
  }
  const command = positionals[0];
  if (!(COMMANDS as readonly string[]).includes(command)) {
    throw new CliUsageError(
      `comando inválido: "${command}" (esperado dev|build|start)`,
    );
  }

  const env = parseEntornoFromArgv(args);
  if (!env) {
    throw new CliUsageError(
      "falta --env=dev|test|prod (el Entorno se elige por process.argv, ADR 0011)",
    );
  }

  return {
    command: command as NextCliCommand,
    env,
    port,
    webpack,
    verifyBuild,
    allowProdBuild,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return;
  }

  let options: NextCliOptions;
  try {
    options = parseNextCliArgs(args);
  } catch (error) {
    console.error(
      `❌ ${error instanceof Error ? error.message : String(error)}\n`,
    );
    console.error(USAGE);
    process.exit(1);
  }

  const allowProdBuild =
    options.allowProdBuild || process.env.ALLOW_PROD_BUILD === "1";

  // ANTES de cualquier import de Next.js ni de `next.config.ts`: el alias del
  // bundler y `distDir` se calculan con la fachada ya inicializada en este
  // proceso (mismo patrón que `initConfig` en los `vitest.config.ts`).
  initConfig(options.env, {
    verifyBuild: options.verifyBuild,
    allowProdBuild,
  });

  // Señal IPC a los workers de Next (ver comentario en `next.config.ts`):
  // Next 16 re-evalúa el config en workers de jest-worker con estado de módulo
  // nuevo; el flag `--verify` viaja por aquí para que TODOS los procesos
  // acuerden `distDir` (`config.nextBuildDir()`). Siempre se fija (vacío si no
  // aplica) para que un valor heredado del shell no contamine un build normal.
  (process.env as { NEXT_CLI_VERIFY?: string }).NEXT_CLI_VERIFY =
    options.verifyBuild ? "1" : "";

  // Ver ADR 0006: `build` escribe el .next de prod salvo que pida explícitamente
  // aislamiento (--verify) u opt-in del operador (--allow-prod-build o ALLOW_PROD_BUILD=1).
  if (options.command === "build" && !options.verifyBuild && !allowProdBuild) {
    console.error(
      [
        "❌ build bloqueado: escribe el .next que sirve prod bajo pm2 (ADR 0006).",
        "  · Verificación (agente/CI):      --verify            → compila en .next/verify, aislado.",
        "  · Operador/CI construyendo prod: --allow-prod-build  → opt-in explícito para .next.",
      ].join("\n"),
    );
    process.exit(1);
  }

  // `dev` exige development (replica el bloque `env` que el webServer de
  // Playwright forzaba: con NODE_ENV=production heredado, next dev revienta el
  // pipeline CSS); build/start son siempre production. Next marca NODE_ENV
  // como readonly en los tipos, pero aquí es exactamente el punto: fijar el
  // modo por argv en ESTE proceso, no heredarlo.
  (process.env as { NODE_ENV?: string }).NODE_ENV =
    options.command === "dev" ? "development" : "production";

  // Bundler interno de Next (ver comentario superior): con --webpack,
  // TURBOPACK falsy; sin él en `dev`, el default Turbopack (`auto`).
  if (options.webpack) delete process.env.TURBOPACK;
  else if (options.command === "dev") process.env.TURBOPACK ||= "auto";

  // Raíz del paquete chatbot anclada al fichero (no al cwd): los scripts se
  // invocan desde varios cwd (pnpm --filter, playwright, eval-runner).
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const port = options.port ?? config.port();

  if (options.command === "build") {
    // Imports internos dinámicos: mantener el módulo importable (tests del
    // parser) sin cargar Next.js ni registrar sus handlers de señal.
    const { nextBuild } = await import("next/dist/cli/next-build");
    await nextBuild(
      {
        mangling: true,
        experimentalDebugMemoryUsage: false,
        experimentalBuildMode: "default",
        ...(options.webpack ? { webpack: true } : {}),
      },
      dir,
    );
    // Como `next/dist/bin/next`: salir aunque queden handles abiertos.
    process.exit(0);
  }

  const { startServer } = await import("next/dist/server/lib/start-server");
  await startServer({
    dir,
    port,
    isDev: options.command === "dev",
    // Puerto fijo explícito: sin retry (como `next dev -p`/`next start -p`
    // con puerto pasado a mano; un puerto ocupado debe fallar, no migrarse).
    allowRetry: false,
  });
}

/**
 * Ejecución directa vs. import (tests unitarios del parser): solo corre
 * `main()` cuando este fichero es el entrypoint de `process.argv[1]`.
 */
const isDirectInvocation = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isDirectInvocation) {
  void main().catch((error) => {
    console.error("❌ next-cli:", error);
    process.exit(1);
  });
}
