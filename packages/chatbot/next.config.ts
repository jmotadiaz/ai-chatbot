import path from "node:path";
import type { NextConfig } from "next";
import {
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from "next/constants";
import { config, type Environment } from "config";
// Build helpers outside the isomorphic surface (they never travel to the client
// or to the Edge Runtime): they are imported by path so they stay available even
// when `"config"` is aliased to `env.<environment>.ts` (vitest tests).
import { envBundlePath } from "../config/src/argv";
import { setBuildFlags } from "../config/src/facade";
import { config as prodBundleConfig } from "../config/src/env.prod";

/**
 * Launcher → Next workers IPC signal (NOT app configuration).
 *
 * Next 16 re-evaluates `next.config.ts` in the jest-worker workers (threads or
 * forks) during `build`: every re-evaluation loads `packages/config` AGAIN
 * with the clean module state of `facade.ts`, so `--verify` (set by
 * `initConfig` in the launcher's process) never reached them and `distDir`
 * diverged (main → `.next/verify`, workers → `.next`), breaking the build with
 * an ENOENT on the manifests. The launcher exports ITS flag as
 * `NEXT_CLI_VERIFY=1` (single producer, cleared on every start) and here
 * `setBuildFlags` is rehydrated on EVERY evaluation — `distDir` still comes from
 * `config.nextBuildDir()` in every process.
 *
 * It is not an Environment selector (ADR 0011: that goes through argv/`initConfig`), nor a
 * path, nor a credential: it only propagates the launcher's artifact-isolation flag
 * to the workers Next spawns. Contract in
 * `tests/unit/config/next-config-env-alias.test.ts` (the only `process.env.*`
 * allowed in this file).
 */
if (process.env.NEXT_CLI_VERIFY === "1") {
  setBuildFlags({ verifyBuild: true });
}

/**
 * Next.js configuration with the Environment welded in at compile time (ADR 0011 §4.2).
 *
 * ### Alias `"config"` → `packages/config/src/env.<environment>.ts` (Turbopack and Webpack)
 *
 * Both `turbopack.resolveAlias` and `webpack.resolve.alias` redirect the
 * `"config"` import to the active Environment's static bundle, so that ALL the compiled
 * code — Server Components, Route Handlers, Client Components and the
 * child workers Next forks in `build`/`dev` — statically imports the
 * bundle of its Environment. Neither `process.env` nor `process.argv` (which the kernel does not
 * propagate across `fork()`) take part in the resolution in the children.
 *
 * Each `env.<env>.ts` re-exports the package's full isomorphic surface
 * (`surface.ts`: types, Gateway contract constants, paths,
 * `optional`, …) plus the `config` facade of its bundle, so the alias
 * can point at the Environment's file directly and all the compiled code
 * keeps the same API as the public entry point.
 *
 * ### Where the Environment comes from (no `process.argv` here)
 *
 * This file is evaluated in the SAME process as the launcher
 * `scripts/next-cli.ts`, which already ran `initConfig(env, …)`: that's why
 * `config.environment()` is reliable and `process.argv` is NOT read in the config.
 *
 * Single documented fallback (spec §4.2): if the selector throws (e.g. a
 * direct `next build`/`next start`, OUTSIDE the launcher — the pre-ticket 04
 * scripts still do that), in the production build/serve phases
 * `"prod"` is assumed using prod's static bundle (ADR 0006: only prod is
 * built/served). In any other phase the error propagates: a direct `next dev`
 * must fail with ADR 0011's ConfigError instead of starting up
 * welded to a guessed Environment. `process.env` is not read here either: the
 * old `NEXT_BUILD_DIR` died in ticket 01 (`config.nextBuildDir()`),
 * `--verify` arrives through build flags that the launcher sets via `initConfig`.
 */
function activeEnvironment(phase: string): { environment: Environment; cfg: typeof config } {
  try {
    return { environment: config.environment(), cfg: config };
  } catch (error) {
    if (
      phase === PHASE_PRODUCTION_BUILD ||
      phase === PHASE_PRODUCTION_SERVER
    ) {
      return { environment: "prod", cfg: prodBundleConfig };
    }
    throw error;
  }
}

/**
 * Specifier of the Environment's bundle for the Turbopack alias.
 *
 * Turbopack (Next 16) interprets an alias value starting with `/` as a
 * "server relative" import (root-relative URL) and fails with "server relative
 * imports are not implemented yet", so the absolute path is no good. The
 * `@/…` specifier is resolved by the `tsconfig.json` paths
 * (`"@/*": ["./*"]`) and `../` normalises to `packages/config/src/env.<environment>`:
 * the alias points DIRECTLY at the Environment's static bundle, with no shims.
 * Contract in `tests/unit/config/next-config-env-alias.test.ts`.
 */
const configBundleAlias = (environment: Environment): string =>
  `@/../config/src/env.${environment}`;

const nextConfig = (phase: string): NextConfig => {
  const { environment, cfg } = activeEnvironment(phase);
  const configAlias = configBundleAlias(environment);
  const disableDevIndicators = cfg.disableDevIndicator();

  return {
    // Parameterizable distDir: `build:verify` (`--verify`) compiles to
    // `.next/verify` without overwriting the `.next` prod serves under pm2 (ADR 0006).
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
        "config/contract": "@/../config/src/gateway-contract",
        config: configAlias,
      },
    },
    // Webpack (the launcher's `--webpack` and Playwright's webServer):
    // keeps Next's internal aliases and adds the Environment's.
    webpack: (config, options) => {
      const existing = config.resolve?.alias;
      // Webpack does accept the absolute path: same module as Turbopack without
      // relying on the `@/…` normalisation.
      const webpackAlias = envBundlePath(environment);
      const contractPath = path.join(__dirname, "../config/src/gateway-contract.ts");
      const isClient = (options as { isServer?: boolean } | undefined)?.isServer === false;
      config.resolve = {
        ...config.resolve,
        alias: {
          ...(typeof existing === "object" && existing !== null
            ? existing
            : {}),
          "config/contract": contractPath,
          // In the client bundle (browser), importing `"config"` as a whole
          // is FORBIDDEN to avoid inlining server secrets.
          // Only `"config/contract"` is allowed (pure types and constants).
          config: isClient ? false : webpackAlias,
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
