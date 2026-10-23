import { describe, expect, it } from "vitest";
import {
  CliUsageError,
  USAGE,
  parseNextCliArgs,
  type NextCliOptions,
} from "@/scripts/next-cli";

/**
 * Parser PURO de `scripts/next-cli.ts` (ticket 03): nada de Next.js ni de
 * `initConfig` en este módulo, así el contrato del argv (--env, --port,
 * --webpack, --verify, --allow-prod-build) se testea sin arrancar servidores.
 */
const parse = (args: string[]) => parseNextCliArgs(args);

describe("parseNextCliArgs", () => {
  it("dev con --env=... y defaults (sin bundler, sin flags de build)", () => {
    expect(parse(["dev", "--env=dev"])).toEqual<NextCliOptions>({
      command: "dev",
      env: "dev",
      port: undefined,
      webpack: false,
      verifyBuild: false,
      allowProdBuild: false,
    });
  });

  it("start con puerto explícito", () => {
    const options = parse(["start", "--env=prod", "--port=8085"]);
    expect(options.command).toBe("start");
    expect(options.env).toBe("prod");
    expect(options.port).toBe(8085);
  });

  it("build con --verify y --allow-prod-build como banderas independientes", () => {
    const verify = parse(["build", "--env=prod", "--verify"]);
    expect(verify.verifyBuild).toBe(true);
    expect(verify.allowProdBuild).toBe(false);

    const allowed = parse(["build", "--env=prod", "--allow-prod-build"]);
    expect(allowed.verifyBuild).toBe(false);
    expect(allowed.allowProdBuild).toBe(true);
  });

  it("--webpack activa Webpack (Turbopack queda para el launcher, no el parser)", () => {
    expect(parse(["dev", "--env=test", "--webpack"]).webpack).toBe(true);
    expect(parse(["dev", "--env=test"]).webpack).toBe(false);
  });

  it("acepta --env y --port con forma de valor separado", () => {
    const options = parse(["dev", "--env", "test", "--port", "3001"]);
    expect(options.env).toBe("test");
    expect(options.port).toBe(3001);
    expect(options.command).toBe("dev");
  });

  it("sin --env falla con CliUsageError (no existe Entorno por defecto, ADR 0011)", () => {
    expect(() => parse(["dev"])).toThrow(CliUsageError);
    expect(() => parse(["dev"])).toThrow(/--env/);
  });

  it("--env inválido lanza ConfigError del paquete config (nunca cae a un default)", () => {
    expect(() => parse(["dev", "--env=staging"])).toThrow(/staging/);
  });

  it("comando ausente o desconocido → CliUsageError", () => {
    expect(() => parse(["--env=dev"])).toThrow(/comando/);
    expect(() => parse(["deploy", "--env=dev"])).toThrow(/comando inválido/);
    expect(() => parse(["dev", "start", "--env=dev"])).toThrow(/comandos de más/);
  });

  it("flags desconocidos y puertos inválidos se rechazan", () => {
    expect(() => parse(["dev", "--env=dev", "--turbo"])).toThrow(
      /argumento desconocido/,
    );
    expect(() => parse(["dev", "--env=dev", "--port=0"])).toThrow(/--port/);
    expect(() => parse(["dev", "--env=dev", "--port=abc"])).toThrow(/--port/);
    expect(() => parse(["dev", "--env=dev", "--port"])).toThrow(/--port/);
    expect(() => parse(["dev", "--env"])).toThrow(/--env/);
  });

  it("la ayuda documenta el contrato completo del launcher", () => {
    expect(USAGE).toContain("--env=dev|test|prod");
    expect(USAGE).toContain("--port=<n>");
    expect(USAGE).toContain("--webpack");
    expect(USAGE).toContain("--verify");
    expect(USAGE).toContain("--allow-prod-build");
    expect(USAGE).toContain("dev|build|start");
  });
});
