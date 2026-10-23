import { afterEach, describe, expect, it } from "vitest";
import { config, initConfig, resetConfigForTests } from "../../src/config";
import {
  detectTestRunner,
  parseBuildFlagsFromArgv,
  parseEntornoFromArgv,
} from "../../src/argv";
import { optional } from "../../src/facade";
import { ConfigError } from "../../src/errors";
import { packagePath } from "../../src/paths";

/**
 * Selección de Entorno por `process.argv` / `initConfig()` (ADR 0011 §3.5).
 * Sin `process.env`: solo argumentos del propio proceso.
 */
afterEach(() => {
  resetConfigForTests();
});

describe("parseEntornoFromArgv", () => {
  it("acepta --env=<entorno> y --env <entorno>", () => {
    expect(parseEntornoFromArgv(["node", "script.ts", "--env=dev"])).toBe("dev");
    expect(parseEntornoFromArgv(["node", "script.ts", "--env", "test"])).toBe("test");
    expect(parseEntornoFromArgv(["node", "script.ts"])).toBeUndefined();
  });

  it("falla rápido con un valor desconocido (nunca cae al default)", () => {
    expect(() => parseEntornoFromArgv(["node", "x", "--env=staging"])).toThrow(ConfigError);
    expect(() => parseEntornoFromArgv(["node", "x", "--env=staging"])).toThrow(/staging/);
  });
});

describe("parseBuildFlagsFromArgv", () => {
  it("reconoce --verify y --allow-prod-build", () => {
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
  it("detecta vitest y playwright lanzados a mano", () => {
    expect(detectTestRunner(["node", "/repo/node_modules/.bin/vitest", "run"])).toBe("test");
    expect(detectTestRunner(["node", "/repo/node_modules/@playwright/test/cli.js"])).toBe("test");
    expect(detectTestRunner(["node", "/repo/packages/chatbot/node_modules/.bin/playwright"])).toBe(
      "test",
    );
    expect(detectTestRunner(["node", "dist/transports/http.js", "--env=prod"])).toBeUndefined();
  });
});

describe("initConfig", () => {
  it("fija el bundle activo y expone la API histórica", () => {
    initConfig("dev");
    expect(config.entorno()).toBe("dev");
    expect(config.port()).toBe(3000);
    expect(config.codingAgentWorkerPort()).toBe(3016);
    expect(config.codingAgentSessionsDir()).toContain(".pi-dev/sessions");
    expect(config.modelGatewayUrl()).toBe("http://127.0.0.1:4000");
  });

  it("cambia de Entorno sin residuos", () => {
    initConfig("prod");
    expect(config.port()).toBe(8085);
    initConfig("test");
    expect(config.port()).toBe(3001);
    expect(config.modelGatewayUrl()).toBe("http://127.0.0.1:4001");
  });

  it("aísla los artefactos de compilación con --verify", () => {
    initConfig("prod", { verifyBuild: true });
    expect(config.nextBuildDir()).toBe(".next/verify");
    expect(config.codingAgentModelsJson()).toBe(
      packagePath("coding-agent", ".pi-verify/models.json"),
    );
    expect(config.verifyBuild()).toBe(true);
    expect(config.allowProdBuild()).toBe(false);
  });

  it("--allow-prod-build es un opt-in explícito", () => {
    initConfig("prod", { argv: ["node", "next-cli.ts", "--allow-prod-build"] });
    expect(config.allowProdBuild()).toBe(true);
    resetConfigForTests();
    initConfig("prod", { argv: ["node", "next-cli.ts"] });
    expect(config.allowProdBuild()).toBe(false);
  });

  it("rechaza Entornos desconocidos", () => {
    // @ts-expect-error -- valor inválido a propósito
    expect(() => initConfig("staging")).toThrow(ConfigError);
  });

  it("cae al argv del proceso cuando no hay initConfig", () => {
    const original = process.argv;
    try {
      process.argv = ["node", "dist/transports/http.js", "--env=prod"];
      resetConfigForTests();
      expect(config.entorno()).toBe("prod");
      expect(config.port()).toBe(8085);
    } finally {
      process.argv = original;
    }
  });

  it("falla rápido sin --env ni runner de test", () => {
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

  it("detecta el runner de test desde argv del proceso", () => {
    const original = process.argv;
    try {
      process.argv = ["node", "/repo/node_modules/.bin/vitest", "run"];
      resetConfigForTests();
      expect(config.entorno()).toBe("test");
      expect(config.port()).toBe(3001);
    } finally {
      process.argv = original;
    }
  });
});

describe("optional", () => {
  it("convierte un acceso válido en su valor", () => {
    initConfig("test");
    expect(optional(() => config.postgresUrl())).toContain("5434/test");
  });
});
