import { describe, expect, it } from "vitest";
import {
  CliUsageError,
  USAGE,
  parseNextCliArgs,
  type NextCliOptions,
} from "@/scripts/next-cli";

/**
 * PURE parser of `scripts/next-cli.ts` (ticket 03): no Next.js and no
 * `initConfig` in this module, so the argv contract (--env, --port, --webpack,
 * --verify, --allow-prod-build) is tested without starting servers.
 */
const parse = (args: string[]) => parseNextCliArgs(args);

describe("parseNextCliArgs", () => {
  it("dev with --env=... and defaults (no bundler, no build flags)", () => {
    expect(parse(["dev", "--env=dev"])).toEqual<NextCliOptions>({
      command: "dev",
      env: "dev",
      port: undefined,
      webpack: false,
      verifyBuild: false,
      allowProdBuild: false,
    });
  });

  it("start with an explicit port", () => {
    const options = parse(["start", "--env=prod", "--port=8085"]);
    expect(options.command).toBe("start");
    expect(options.env).toBe("prod");
    expect(options.port).toBe(8085);
  });

  it("build with --verify and --allow-prod-build as independent flags", () => {
    const verify = parse(["build", "--env=prod", "--verify"]);
    expect(verify.verifyBuild).toBe(true);
    expect(verify.allowProdBuild).toBe(false);

    const allowed = parse(["build", "--env=prod", "--allow-prod-build"]);
    expect(allowed.verifyBuild).toBe(false);
    expect(allowed.allowProdBuild).toBe(true);
  });

  it("--webpack enables Webpack (Turbopack is left to the launcher, not the parser)", () => {
    expect(parse(["dev", "--env=test", "--webpack"]).webpack).toBe(true);
    expect(parse(["dev", "--env=test"]).webpack).toBe(false);
  });

  it("accepts --env and --port in separate-value form", () => {
    const options = parse(["dev", "--env", "test", "--port", "3001"]);
    expect(options.env).toBe("test");
    expect(options.port).toBe(3001);
    expect(options.command).toBe("dev");
  });

  it("without --env it fails with CliUsageError (there is no default Environment, ADR 0011)", () => {
    expect(() => parse(["dev"])).toThrow(CliUsageError);
    expect(() => parse(["dev"])).toThrow(/--env/);
  });

  it("an invalid --env throws the config package's ConfigError (it never falls back to a default)", () => {
    expect(() => parse(["dev", "--env=staging"])).toThrow(/staging/);
  });

  it("missing or unknown command → CliUsageError", () => {
    expect(() => parse(["--env=dev"])).toThrow(/command/);
    expect(() => parse(["deploy", "--env=dev"])).toThrow(/invalid command/);
    expect(() => parse(["dev", "start", "--env=dev"])).toThrow(/too many commands/);
  });

  it("unknown flags and invalid ports are rejected", () => {
    expect(() => parse(["dev", "--env=dev", "--turbo"])).toThrow(
      /unknown argument/,
    );
    expect(() => parse(["dev", "--env=dev", "--port=0"])).toThrow(/--port/);
    expect(() => parse(["dev", "--env=dev", "--port=abc"])).toThrow(/--port/);
    expect(() => parse(["dev", "--env=dev", "--port"])).toThrow(/--port/);
    expect(() => parse(["dev", "--env"])).toThrow(/--env/);
  });

  it("the help documents the launcher's full contract", () => {
    expect(USAGE).toContain("--env=dev|test|prod");
    expect(USAGE).toContain("--port=<n>");
    expect(USAGE).toContain("--webpack");
    expect(USAGE).toContain("--verify");
    expect(USAGE).toContain("--allow-prod-build");
    expect(USAGE).toContain("dev|build|start");
  });
});
