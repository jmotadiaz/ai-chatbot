import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contrato del tradeoff de ADR 0011 (spec §4.1): `scripts/next-cli.ts` importa
 * DOS módulos internos de Next.js no cubiertos por semver público —
 * `startServer` (`next/dist/server/lib/start-server`) y `nextBuild`
 * (`next/dist/cli/next-build`). Al subir de versión mayor de Next.js, este
 * test falla si las firmas que replica el launcher cambian, antes de que
 * rompa un build o un server.
 *
 * Se leen los `.d.ts` (no se importan los módulos: `next-build` arrastra el
 * pipeline de build completo y `start-server` registra handlers de señal — la
 * ejecución real la cubre `next-cli build --verify`).
 */
const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const NEXT_DIST = path.join(PACKAGE_ROOT, "node_modules", "next", "dist");

const readDts = (relative: string) =>
  readFileSync(path.join(NEXT_DIST, relative), "utf8");

describe("APIs internas de Next.js usadas por scripts/next-cli.ts", () => {
  it("start-server: startServer(StartServerOptions) con dir/port/isDev/allowRetry", () => {
    const dts = readDts(path.join("server", "lib", "start-server.d.ts"));
    expect(dts).toMatch(
      /export declare function startServer\(serverOptions: StartServerOptions\)/,
    );
    // Campos que pasa el launcher.
    expect(dts).toMatch(/\bdir: string;/);
    expect(dts).toMatch(/\bport: number;/);
    expect(dts).toMatch(/\bisDev: boolean;/);
    expect(dts).toMatch(/\ballowRetry\?: boolean;/);
  });

  it("next-build: nextBuild(NextBuildOptions, directory?) con los campos que replica el launcher", () => {
    const dts = readDts(path.join("cli", "next-build.d.ts"));
    expect(dts).toMatch(
      /declare const nextBuild: \(options: NextBuildOptions, directory\?: string\) => Promise<void>/,
    );
    // Defaults que next-cli replica de `next/dist/bin/next` (Next 16.1.1).
    expect(dts).toMatch(/\bmangling: boolean;/);
    expect(dts).toMatch(/\bexperimentalDebugMemoryUsage: boolean;/);
    expect(dts).toMatch(/\bexperimentalBuildMode: 'default' \| 'compile'/);
    // Bundler: `--webpack` se pasa como flag; sin él, Turbopack por defecto.
    expect(dts).toMatch(/\bwebpack\?: boolean;/);
    expect(dts).toMatch(/\bturbopack\?: boolean;/);
  });
});
