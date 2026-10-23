import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contract of the ADR 0011 tradeoff (spec §4.1): `scripts/next-cli.ts` imports
 * TWO Next.js internal modules not covered by public semver — `startServer`
 * (`next/dist/server/lib/start-server`) and `nextBuild`
 * (`next/dist/cli/next-build`). When bumping Next.js' major version, this test
 * fails if the signatures the launcher replicates change, before a build or a
 * server breaks.
 *
 * The `.d.ts` files are read (the modules are not imported: `next-build` drags
 * the whole build pipeline and `start-server` registers signal handlers — the
 * real run is covered by `next-cli build --verify`).
 */
const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const NEXT_DIST = path.join(PACKAGE_ROOT, "node_modules", "next", "dist");

const readDts = (relative: string) =>
  readFileSync(path.join(NEXT_DIST, relative), "utf8");

describe("Next.js internal APIs used by scripts/next-cli.ts", () => {
  it("start-server: startServer(StartServerOptions) with dir/port/isDev/allowRetry", () => {
    const dts = readDts(path.join("server", "lib", "start-server.d.ts"));
    expect(dts).toMatch(
      /export declare function startServer\(serverOptions: StartServerOptions\)/,
    );
    // Fields the launcher passes.
    expect(dts).toMatch(/\bdir: string;/);
    expect(dts).toMatch(/\bport: number;/);
    expect(dts).toMatch(/\bisDev: boolean;/);
    expect(dts).toMatch(/\ballowRetry\?: boolean;/);
  });

  it("next-build: nextBuild(NextBuildOptions, directory?) with the fields the launcher replicates", () => {
    const dts = readDts(path.join("cli", "next-build.d.ts"));
    expect(dts).toMatch(
      /declare const nextBuild: \(options: NextBuildOptions, directory\?: string\) => Promise<void>/,
    );
    // Defaults that next-cli replicates from `next/dist/bin/next` (Next 16.1.1).
    expect(dts).toMatch(/\bmangling: boolean;/);
    expect(dts).toMatch(/\bexperimentalDebugMemoryUsage: boolean;/);
    expect(dts).toMatch(/\bexperimentalBuildMode: 'default' \| 'compile'/);
    // Bundler: `--webpack` is passed as a flag; without it, Turbopack by default.
    expect(dts).toMatch(/\bwebpack\?: boolean;/);
    expect(dts).toMatch(/\bturbopack\?: boolean;/);
  });
});
