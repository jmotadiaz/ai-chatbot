import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  PHASE_PRODUCTION_BUILD,
  PHASE_DEVELOPMENT_SERVER,
} from "next/constants";
import { describe, expect, it, vi } from "vitest";

/**
 * Contract of the Environment's static link (ADR 0011 §4.2, ticket 03):
 *
 * 1. `next.config.ts` does NOT read `process.argv` (the active Environment is
 *    provided by the `scripts/next-cli.ts` launcher via `initConfig` in the
 *    SAME process) and touches only ONE `process.env.*`: `NEXT_CLI_VERIFY`, the
 *    launcher→workers IPC signal of `--verify` (Next re-evaluates the config in
 *    jest-worker workers with fresh module state; see the comment in
 *    next.config).
 * 2. `turbopack.resolveAlias` and `webpack.resolve.alias` redirect `"config"`
 *    DIRECTLY to the active Environment's static bundle
 *    (`packages/config/src/env.<environment>.ts`), with no intermediate shims.
 * 3. That bundle exports the `config` facade SOLDERED to its Environment and
 *    the package's full isomorphic surface (`surface.ts`).
 *
 * In the tests the Environment is test (initConfig + alias), so the expected
 * active Environment is `"test"`.
 */
const PACKAGE_ROOT = path.resolve(__dirname, "../../..");

async function loadActiveNextConfig() {
  const mod = await import("@/next.config");
  expect(typeof mod.default).toBe("function");
  return mod.default(PHASE_DEVELOPMENT_SERVER);
}

describe("next.config Environment alias", () => {
  it("does not read process.argv; from process.env only NEXT_CLI_VERIFY (IPC with workers)", () => {
    const source = readFileSync(path.join(PACKAGE_ROOT, "next.config.ts"), "utf8");
    // Comments stripped: they document the allowed "no process.env/argv".
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(code).not.toContain("process.argv");
    // Here there is NO Environment selector (NEXT_PUBLIC_ENV/APP_ENV), paths or
    // per-env credentials: only the launcher's isolation flag.
    const envReads = [...code.matchAll(/process\.env\.[A-Z_0-9]+/g)].map(
      (match) => match[0],
    );
    expect(new Set(envReads)).toEqual(
      new Set(["process.env.NEXT_CLI_VERIFY"]),
    );
  });

  it("--verify IPC: a worker with fresh modules rehydrates flags and agrees on .next/verify", async () => {
    // Simulates the config re-evaluation in a jest-worker worker: fresh modules
    // (without the launcher's setBuildFlags) + inherited NEXT_CLI_VERIFY.
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

  it("turbopack.resolveAlias and webpack.resolve.alias point to the active Environment's bundle", async () => {
    // Turbopack: `@/…` specifier (tsconfig paths) + `../` up to
    // packages/config — an absolute `/…` path would be "server relative" and is
    // not supported. Webpack: absolute path to the same module.
    const expectedFile = path.join(PACKAGE_ROOT, "..", "config", "src", "env.test.ts");

    const config = await loadActiveNextConfig();
    expect(config.turbopack?.resolveAlias?.config).toBe("@/../config/src/env.test");
    expect(config.turbopack?.resolveAlias?.["config/contract"]).toBe(
      "@/../config/src/gateway-contract",
    );
    expect(existsSync(expectedFile)).toBe(true);

    // Webpack's alias is computed when the factory is invoked, preserving the
    // previous aliases that Next injects.
    const withExisting = config.webpack!(
      { resolve: { alias: { "next/internal": "kept" } } } as never,
      {} as never,
    );
    expect(withExisting.resolve?.alias).toMatchObject({
      "next/internal": "kept",
      config: expectedFile,
      "config/contract": path.join(PACKAGE_ROOT, "..", "config", "src", "gateway-contract.ts"),
    });

    // In Webpack's client build (isServer: false), config resolves to false to
    // prevent any secret leak to the browser.
    const clientWebpack = config.webpack!(
      { resolve: { alias: {} } } as never,
      { isServer: false } as never,
    );
    expect(clientWebpack.resolve?.alias).toMatchObject({
      config: false,
      "config/contract": path.join(PACKAGE_ROOT, "..", "config", "src", "gateway-contract.ts"),
    });
  });

  it("the Environment bundle exports the soldered facade + the package's full surface", async () => {
    const bundlePath = path.join(PACKAGE_ROOT, "..", "config", "src", "env.test.ts");
    const shim = (await import(bundlePath)) as Record<string, unknown>;

    // Facade soldered to the active Environment's bundle (test): it must be the
    // STATIC facade of env.test, never index's selector facade (proof that the
    // explicit export prevails over `export *`, the precedence the shim
    // documents).
    const facade = shim.config as { environment: () => string; port: () => number };
    expect(typeof facade.environment).toBe("function");
    expect(facade.environment()).toBe("test");
    expect(facade.port()).toBe(3001);

    const selectorMod = (await import(
      path.join(PACKAGE_ROOT, "../config/src/index")
    )) as Record<string, unknown>;
    const bundleMod = (await import(
      path.join(PACKAGE_ROOT, "../config/src/env.test")
    )) as Record<string, unknown>;
    expect(shim.config).toBe(bundleMod.config);
    expect(shim.config).not.toBe(selectorMod.config);

    // Surface that the chatbot code imports from `"config"` besides the
    // facade: the bundle re-exports it from `surface.ts`.
    expect(typeof shim.optional).toBe("function");
    expect(typeof shim.EMBEDDING_DIMENSIONS).toBe("number");
    expect(Array.isArray(shim.GATEWAY_THINKING_LEVELS)).toBe(true);
    expect(typeof shim.setBuildFlags).toBe("function");
  });
});
