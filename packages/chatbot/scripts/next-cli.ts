#!/usr/bin/env tsx
/**
 * Next.js micro-launcher (ADR 0011 §4.1, spec §4, ticket 03).
 *
 * Usage: `npx tsx scripts/next-cli.ts <dev|build|start> --env=dev|test|prod
 *                  [--port=<n>] [--webpack] [--verify] [--allow-prod-build]`
 *
 * ## Why this launcher exists
 *
 * The `next` CLI binary (`next/dist/bin/next`) uses `commander` without
 * `allowUnknownOption()`: it rejects `--env=...`. On top of that, `next dev`
 * (`next/dist/cli/next-dev.js`) starts the server through
 * `child_process.fork(startServerPath)` without forwarding `process.argv` to the child.
 * Since ADR 0011 forbids selecting the Environment through `process.env` (the kernel
 * clones it on every `fork()`/`execve()` — the vector of the 2026-10-22 incident),
 * the only reliable way is to parse `--env` here and `initConfig()` in THIS same
 * process, which is also the one that evaluates `next.config.ts` and sets the alias
 * `"config"` → `packages/config/src/env.<environment>.ts` (static welding of the
 * Environment into the bundle; Next's child workers don't even need the
 * selector).
 *
 * ## Documented tradeoff: Next.js internal APIs (spec §4.1)
 *
 * We invoke `startServer` (`next/dist/server/lib/start-server`) and `nextBuild`
 * (`next/dist/cli/next-build`), which are NOT covered by public semver:
 * they are Next.js internal modules (`next/dist/bin/next` itself calls them
 * that way). When upgrading Next.js major versions both entrypoints must be
 * re-verified — covered by the contract test
 * `tests/unit/config/next-internals.test.ts` (signature of `StartServerOptions` and
 * `NextBuildOptions` in the `.d.ts` files), plus `build --verify`.
 *
 * We replicate the defaults `next/dist/bin/next` applies for `build`
 * (inspected in Next 16.1.1): `mangling: true`
 * (`--no-mangling` turns it off), `experimentalBuildMode: "default"` and
 * `experimentalDebugMemoryUsage: false`; the bundler is decided as in the CLI:
 * without flags, `next` uses Turbopack by default (internal `TURBOPACK=auto`).
 *
 * ## Bundler in dev: `process.env.TURBOPACK` is INTERNAL to Next, not config
 *
 * The `dev` bundler is not an Environment option (ADR 0011): it is decided by
 * Next.js's internal runtime reading `process.env.TURBOPACK`
 * (`next/dist/lib/bundler#parseBundlerArgs`, `next-dev-server.js`,
 * `start-server.js`). Hence:
 *
 * - WITHOUT `--webpack` we leave the current `next dev` behaviour alone
 *   (Turbopack): `process.env.TURBOPACK ||= "auto"` — exactly what
 *   `next dev` sets by default without flags (equivalent to the historical
 *   `TURBOPACK=1`; `"auto"` is the value `parseBundlerArgs` sets).
 * - WITH `--webpack` we guarantee `process.env.TURBOPACK` is falsy
 *   (`delete`) BEFORE `startServer`/`nextBuild`: if the shell carried an inherited
 *   `TURBOPACK`, `parseBundlerArgs` would abort with "Multiple bundler
 *   flags set" (or start Turbopack instead of Webpack). The flag stays
 *   available for diagnosing bundler-specific issues; the E2E suite no longer
 *   needs it (it runs Turbopack: Next 16.1.1 compiles `/agent/code` without
 *   the stall that forced the old Webpack pin, and the whole suite runs on the
 *   default worker count in under two minutes).
 * - This is the launcher's ONLY use of environment variables, and it is
 *   deliberately unrelated to the app's configuration: it selects neither
 *   Environment, ports nor secrets.
 *
 * ## NODE_ENV
 *
 * `next/dist/bin/next` does `NODE_ENV ||= "development"|"production"` per
 * command. Here we set it (not just `||=`): the `env` block Playwright
 * carried to force `NODE_ENV=development` disappears with this ticket, and
 * `next dev` with a `NODE_ENV=production` inherited from the shell (pm2 context)
 * blows up the CSS pipeline. A build/start with a foreign `NODE_ENV` would
 * also compile in the wrong mode — the Environment is already decided by argv.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, type Environment } from "config";
// `initConfig` lives in the selector, which imports the three bundles: scripts
// do not go through the bundler alias, so we import it by relative path
// so this module keeps working even when `"config"` points at
// `env.<environment>.ts` (e.g. under vitest's alias).
import { parseEnvironmentFromArgv } from "../../config/src/argv";
import { initConfig } from "../../config/src/config";

export type NextCliCommand = "dev" | "build" | "start";

export interface NextCliOptions {
  command: NextCliCommand;
  env: Environment;
  /** `undefined` → `config.port()` of the active Environment. */
  port?: number;
  /** Forces Webpack (dev and build); without it, Turbopack (Next 16's default). */
  webpack: boolean;
  verifyBuild: boolean;
  allowProdBuild: boolean;
}

export const USAGE = [
  "Usage: npx tsx scripts/next-cli.ts <dev|build|start> --env=<environment> [options]",
  "",
  "Commands:",
  "  dev     Starts the development server (next dev equivalent)",
  "  build   Compiles the project (requires --verify or --allow-prod-build)",
  "  start   Serves the production build (next start equivalent)",
  "",
  "Options:",
  "  --env=dev|test|prod   Active Environment (MANDATORY; ADR 0011, via process.argv)",
  "  --port=<n>            Port (default: config.port() of the Environment)",
  "  --webpack             Uses Webpack instead of the default Turbopack",
  "  --verify              Isolated build into .next/verify (build:verify, no gate)",
  "  --allow-prod-build    Explicit operator/CI opt-in to write .next (ADR 0006)",
  "  --help, -h            This help",
  "",
  "Examples:",
  "  npx tsx scripts/next-cli.ts dev --env=dev --port=3000",
  "  npx tsx scripts/next-cli.ts dev --env=test --webpack --port=3001",
  "  npx tsx scripts/next-cli.ts build --env=prod --verify",
  "  npx tsx scripts/next-cli.ts start --env=prod --port=8085",
].join("\n");

/** argv syntax error: single-use message + USAGE by the caller. */
export class CliUsageError extends Error {}

const COMMANDS: readonly NextCliCommand[] = ["dev", "build", "start"];

function parsePort(raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new CliUsageError(`invalid --port: "${raw}" (integer 1-65535)`);
  }
  return value;
}

/**
 * PURE parser of the launcher's arguments (no side effects: it touches neither
 * `process.env` nor `initConfig` nor imports Next.js — that's why it is unit-testable
 * without loading the server). `args` is `process.argv.slice(2)`.
 *
 * - The Environment is resolved with `config`'s canonical parser
 *   (`parseEnvironmentFromArgv`): `--env=x` or `--env x`, and an invalid value
 *   throws `ConfigError` (it never falls back to a default Environment).
 * - Without `--env` → `CliUsageError` with the help (ADR 0011: the launcher is the
 *   process that must declare its Environment; there is no silent default).
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
      if (value === undefined) throw new CliUsageError("--port requires a value (--port=<n>)");
      port = parsePort(value);
      index += 1; // the value is not a positional
      continue;
    }
    if (arg.startsWith("--env=")) continue; // config resolves it
    if (arg === "--env") {
      if (args[index + 1] === undefined) {
        throw new CliUsageError("--env requires a value (--env=dev|test|prod)");
      }
      index += 1; // the value is validated by parseEnvironmentFromArgv (ConfigError if invalid)
      continue;
    }
    throw new CliUsageError(`unknown argument: ${arg}`);
  }

  if (positionals.length === 0) {
    throw new CliUsageError("missing command (dev|build|start)");
  }
  if (positionals.length > 1) {
    throw new CliUsageError(`too many commands: ${positionals.join(" ")}`);
  }
  const command = positionals[0];
  if (!(COMMANDS as readonly string[]).includes(command)) {
    throw new CliUsageError(
      `invalid command: "${command}" (expected dev|build|start)`,
    );
  }

  const env = parseEnvironmentFromArgv(args);
  if (!env) {
    throw new CliUsageError(
      "missing --env=dev|test|prod (the Environment is chosen via process.argv, ADR 0011)",
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

  // BEFORE any import of Next.js or `next.config.ts`: the bundler alias and
  // `distDir` are computed with the facade already initialised in this
  // process (same pattern as `initConfig` in the `vitest.config.ts` files).
  initConfig(options.env, {
    verifyBuild: options.verifyBuild,
    allowProdBuild,
  });

  // IPC signal to Next's workers (see the comment in `next.config.ts`):
  // Next 16 re-evaluates the config in jest-worker workers with fresh module
  // state; the `--verify` flag travels through here so that ALL processes
  // agree on `distDir` (`config.nextBuildDir()`). It is always set (empty when not
  // applicable) so an inherited shell value cannot contaminate a normal build.
  (process.env as { NEXT_CLI_VERIFY?: string }).NEXT_CLI_VERIFY =
    options.verifyBuild ? "1" : "";

  // See ADR 0006: `build` writes prod's .next unless it explicitly requests
  // isolation (--verify) or an operator opt-in (--allow-prod-build or ALLOW_PROD_BUILD=1).
  if (options.command === "build" && !options.verifyBuild && !allowProdBuild) {
    console.error(
      [
        "❌ build blocked: it writes the .next that prod serves under pm2 (ADR 0006).",
        "  · Verification (agent/CI):       --verify            → compiles into .next/verify, isolated.",
        "  · Operator/CI building prod:     --allow-prod-build  → explicit opt-in for .next.",
      ].join("\n"),
    );
    process.exit(1);
  }

  // `dev` requires development (replicates the `env` block Playwright's webServer
  // used to force: with an inherited NODE_ENV=production, next dev blows up the
  // CSS pipeline); build/start are always production. Next marks NODE_ENV
  // as readonly in its types, but this is exactly the point: set the
  // mode by argv in THIS process, do not inherit it.
  (process.env as { NODE_ENV?: string }).NODE_ENV =
    options.command === "dev" ? "development" : "production";

  // Next's internal bundler (see the comment above): with --webpack,
  // TURBOPACK falsy; without it in `dev`, the Turbopack default (`auto`).
  if (options.webpack) delete process.env.TURBOPACK;
  else if (options.command === "dev") process.env.TURBOPACK ||= "auto";

  // Chatbot package root anchored to the file (not to the cwd): the scripts are
  // invoked from various cwds (pnpm --filter, playwright, eval-runner).
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  process.env.REPO_ROOT ||= path.resolve(dir, "../..");
  const port = options.port ?? config.port();

  if (options.command === "build") {
    // Dynamic internal imports: keeps the module importable (parser tests)
    // without loading Next.js or registering its signal handlers.
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
    // Like `next/dist/bin/next`: exit even if handles are left open.
    process.exit(0);
  }

  const { startServer } = await import("next/dist/server/lib/start-server");
  await startServer({
    dir,
    port,
    isDev: options.command === "dev",
    // Explicit fixed port: no retry (like `next dev -p`/`next start -p`
    // with a manually passed port; a busy port must fail, not migrate).
    allowRetry: false,
  });
}

/**
 * Direct execution vs. import (parser unit tests): `main()` only runs
 * when this file is the `process.argv[1]` entrypoint.
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
