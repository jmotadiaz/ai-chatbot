import path from "node:path";
import type { NextConfig } from "next";
import {
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from "next/constants";
import { config, setBuildFlags, type Entorno } from "config";
import { config as prodBundleConfig } from "./lib/config-bundle/env.prod";

/**
 * Señal IPC launcher → workers de Next (NO es configuración de la app).
 *
 * Next 16 re-evalúa `next.config.ts` en los workers de jest-worker (threads o
 * forks) durante `build`: cada re-evaluación carga `packages/config` DE NUEVO
 * con el estado de módulo de `facade.ts` limpio, así que `--verify` (fijado por
 * `initConfig` en el proceso del launcher) no llegaba a ellos y `distDir`
 * divergía (main → `.next/verify`, workers → `.next`) rompiendo el build con
 * un ENOENT sobre los manifests. El launcher exporta SU flag como
 * `NEXT_CLI_VERIFY=1` (único productor, se limpia en cada arranque) y aquí se
 * rehidrata `setBuildFlags` en CADA evaluación — `distDir` sigue saliendo de
 * `config.nextBuildDir()` en todos los procesos.
 *
 * No es un selector de Entorno (ADR 0011: eso va por argv/`initConfig`), ni
 * ruta, ni credencial: solo propaga el flag de aislamiento de artefactos del
 * launcher a los workers que Next genera. Contrato en
 * `tests/contract/next-config-env-alias.test.ts` (único `process.env.*`
 * permitido en este fichero).
 */
if (process.env.NEXT_CLI_VERIFY === "1") {
  setBuildFlags({ verifyBuild: true });
}

/**
 * Configuración de Next.js con el Entorno soldado en compilación (ADR 0011 §4.2).
 *
 * ### Alias `"config"` → `lib/config-bundle/env.<entorno>.ts` (Turbopack y Webpack)
 *
 * Tanto `turbopack.resolveAlias` como `webpack.resolve.alias` redirigen el
 * import `"config"` al shim del Entorno activo, de modo que TODO el código
 * compilado — Server Components, Route Handlers, Client Components y los
 * workers hijos que Next biforca en `build`/`dev` — importa estáticamente el
 * bundle de su Entorno. Ni `process.env` ni `process.argv` (que el kernel no
 * propaga en `fork()`) participan en la resolución en los hijos.
 *
 * El shim (`lib/config-bundle/env.<env>.ts`, ver su comentario) re-exporta la
 * superficie completa del paquete `config` además de la fachada `config` del
 * bundle: apuntar el alias directamente a `packages/config/src/env.<env>.ts`
 * dejaría `optional` / `EMBEDDING_DIMENSIONS` / `GATEWAY_THINKING_LEVELS`
 * como `undefined` en el bundle, porque ese módulo solo exporta `envX` + la
 * fachada.
 *
 * ### De dónde sale el Entorno (sin `process.argv` aquí)
 *
 * Este fichero se evalúa en el MISMO proceso que el launcher
 * `scripts/next-cli.ts`, que ya ejecutó `initConfig(env, …)`: por eso
 * `config.entorno()` es fiable y NO se lee `process.argv` en el config.
 *
 * Único fallback documentado (spec §4.2): si el selector lanza (p. ej.
 * `next build`/`next start` directo, FUERA del launcher — los scripts
 * pre-ticket 04 todavía lo hacen), en las fases de build/serve de producción
 * se asume `"prod"` usando el bundle estático de prod (ADR 0006: solo prod se
 * construye/serve). En cualquier otra fase el error se propaga: un `next dev`
 * directo debe fallar con el ConfigError de ADR 0011 en lugar de arrancar
 * soldado a un Entorno adivinado. Tampoco se leen `process.env` aquí: el
 * antiguo `NEXT_BUILD_DIR` murió en el ticket 01 (`config.nextBuildDir()`),
 * `--verify` llega por flags de build que el launcher fija vía `initConfig`.
 */
function activeEntorno(phase: string): { entorno: Entorno; cfg: typeof config } {
  try {
    return { entorno: config.entorno(), cfg: config };
  } catch (error) {
    if (
      phase === PHASE_PRODUCTION_BUILD ||
      phase === PHASE_PRODUCTION_SERVER
    ) {
      return { entorno: "prod", cfg: prodBundleConfig };
    }
    throw error;
  }
}

const configBundleAlias = (entorno: Entorno): string =>
  // `@/…` en vez de ruta absoluta: Turbopack (Next 16) interpreta un valor de
  // alias que empieza por `/` como import "server relative" (URL root-relative)
  // y falla con "server relative imports are not implemented yet"; Webpack
  // sí acepta rutas absolutas. El specifier `@/…` — resuelto por los paths de
  // `tsconfig.json` (`"@/*": ["./*"]`) en AMBOS bundlers — es la única forma
  // portátil de apuntar al mismo fichero. Ver tests/contract/next-config-env-alias.
  `@/lib/config-bundle/env.${entorno}`;

const nextConfig = (phase: string): NextConfig => {
  const { entorno, cfg } = activeEntorno(phase);
  const configAlias = configBundleAlias(entorno);
  const disableDevIndicators = cfg.disableDevIndicator();

  return {
    // distDir parametrizable: `build:verify` (`--verify`) compila a
    // `.next/verify` sin pisar el `.next` que sirve prod bajo pm2 (ADR 0006).
    distDir: cfg.nextBuildDir(),
    experimental: {
      viewTransition: true,
      authInterrupts: true,
      optimizePackageImports: [
        "@radix-ui/react-collapsible",
        "@radix-ui/react-use-controllable-state",
        "motion/react",
        "sonner",
        "use-debounce",
      ],
    },
    turbopack: {
      root: path.join(__dirname, "../.."),
      resolveAlias: {
        config: configAlias,
      },
    },
    // Webpack (el `--webpack` del launcher y del webServer de Playwright):
    // conserva los aliases internos de Next y añade el del Entorno.
    webpack: (config) => {
      const existing = config.resolve?.alias;
      config.resolve = {
        ...config.resolve,
        alias: {
          ...(typeof existing === "object" && existing !== null
            ? existing
            : {}),
          config: configAlias,
        },
      };
      return config;
    },
    images: {
      remotePatterns: [
        new URL("https://cwbcp1ymgf2pibcv.public.blob.vercel-storage.com/**"),
      ],
    },

    ...(disableDevIndicators && { devIndicators: false }),
  };
};

export default nextConfig;
