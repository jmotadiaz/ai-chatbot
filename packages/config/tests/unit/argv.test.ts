import { afterEach, describe, expect, it } from "vitest";
import { config, initConfig, resetConfigForTests } from "../../src/config";
import {
  detectTestRunner,
  parseBuildFlagsFromArgv,
  parseEnvironmentFromArgv,
} from "../../src/argv";
import { optional } from "../../src/facade";
import { ConfigError } from "../../src/errors";
import { packagePath } from "../../src/paths";

/**
 * Environment selection via `process.argv` / `initConfig()` (ADR 0011 §3.5).
 * No `process.env`: only the process's own arguments.
 */
afterEach(() => {
  resetConfigForTests();
});

describe("parseEnvironmentFromArgv", () => {
  it("accepts --env=<environment> and --env <environment>", () => {
    expect(parseEnvironmentFromArgv(["node", "script.ts", "--env=dev"])).toBe("dev");
    expect(parseEnvironmentFromArgv(["node", "script.ts", "--env", "test"])).toBe("test");
    expect(parseEnvironmentFromArgv(["node", "script.ts"])).toBeUndefined();
  });

  it("fails fast on an unknown value (never falls back to the default)", () => {
    expect(() => parseEnvironmentFromArgv(["node", "x", "--env=staging"])).toThrow(ConfigError);
    expect(() => parseEnvironmentFromArgv(["node", "x", "--env=staging"])).toThrow(/staging/);
  });
});

describe("parseBuildFlagsFromArgv", () => {
  it("recognizes --verify and --allow-prod-build", () => {
    expect(parseBuildFlagsFromArgv(["node", "x", "--verify"])).toEqual({
      verifyBuild: true,
      allowProdBuild: false,
    });
    expect(parseBuildFlagsFromArgv(["node", "x", "--allow-prod-build"])).toEqual({
      verifyBuild: false,
      allowProdBuild: true,
    });
  });
});

describe("detectTestRunner", () => {
  it("detects vitest and playwright launched by hand", () => {
    expect(detectTestRunner(["node", "/repo/node_modules/.bin/vitest", "run"])).toBe("test");
    expect(detectTestRunner(["node", "/repo/node_modules/@playwright/test/cli.js"])).toBe("test");
    expect(detectTestRunner(["node", "/repo/packages/chatbot/node_modules/.bin/playwright"])).toBe(
      "test",
    );
    expect(detectTestRunner(["node", "dist/transports/http.js", "--env=prod"])).toBeUndefined();
  });
});

describe("initConfig", () => {
  it("sets the active bundle and exposes the historical API", () => {
    initConfig("dev");
    expect(config.environment()).toBe("dev");
    expect(config.port()).toBe(3000);
    expect(config.codingAgentWorkerPort()).toBe(3016);
    expect(config.codingAgentSessionsDir()).toContain(".pi-dev/sessions");
    expect(config.modelGatewayUrl()).toBe("http://127.0.0.1:4000");
  });

  it("switches Environment without leftovers", () => {
    initConfig("prod");
    expect(config.port()).toBe(8085);
    initConfig("test");
    expect(config.port()).toBe(3001);
    expect(config.modelGatewayUrl()).toBe("http://127.0.0.1:4001");
  });

  it("isolates the compilation artifacts with --verify", () => {
    initConfig("prod", { verifyBuild: true });
    expect(config.nextBuildDir()).toBe(".next/verify");
    expect(config.codingAgentModelsJson()).toBe(
      packagePath("coding-agent", ".pi-verify/models.json"),
    );
    expect(config.verifyBuild()).toBe(true);
    expect(config.allowProdBuild()).toBe(false);
  });

  it("--allow-prod-build is an explicit opt-in", () => {
    initConfig("prod", { argv: ["node", "next-cli.ts", "--allow-prod-build"] });
    expect(config.allowProdBuild()).toBe(true);
    resetConfigForTests();
    initConfig("prod", { argv: ["node", "next-cli.ts"] });
    expect(config.allowProdBuild()).toBe(false);
  });

  it("rejects unknown Environments", () => {
    // @ts-expect-error -- invalid value on purpose
    expect(() => initConfig("staging")).toThrow(ConfigError);
  });

  it("falls back to the process argv when there is no initConfig", () => {
    const original = process.argv;
    try {
      process.argv = ["node", "dist/transports/http.js", "--env=prod"];
      resetConfigForTests();
      expect(config.environment()).toBe("prod");
      expect(config.port()).toBe(8085);
    } finally {
      process.argv = original;
    }
  });

  it("fails fast without --env or a test runner", () => {
    const original = process.argv;
    try {
      process.argv = ["node", "dist/transports/http.js"];
      resetConfigForTests();
      expect(() => config.port()).toThrow(ConfigError);
      expect(() => config.port()).toThrow(/Missing required CLI flag --env=prod\|dev\|test/);
    } finally {
      process.argv = original;
    }
  });

  it("detects the test runner from the process argv", () => {
    const original = process.argv;
    try {
      process.argv = ["node", "/repo/node_modules/.bin/vitest", "run"];
      resetConfigForTests();
      expect(config.environment()).toBe("test");
      expect(config.port()).toBe(3001);
    } finally {
      process.argv = original;
    }
  });
});

describe("optional", () => {
  it("converts a valid access into its value", () => {
    initConfig("test");
    expect(optional(() => config.postgresUrl())).toContain("5434/test");
  });
});
