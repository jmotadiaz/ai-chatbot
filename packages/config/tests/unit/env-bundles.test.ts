import { describe, expect, it } from "vitest";
import { configDev } from "../../src/config.dev";
import { configProd } from "../../src/config.prod";
import { configTest } from "../../src/config.test";
import { envDev } from "../../src/env.dev";
import { envProd } from "../../src/env.prod";
import { envTest } from "../../src/env.test";
import { ConfigError } from "../../src/errors";
import {
  assertDbMatchesEntorno,
  assertGatewayMatchesEntorno,
  validateAppConfig,
} from "../../src/guardrails";
import { homePath, packagePath, repoPath } from "../../src/paths";
import type { AppConfig } from "../../src/types";

/**
 * Bundles estáticos por Entorno (ADR 0011 §3.4): valores de aislamiento,
 * coherencia Entorno↔DB↔Gateway e inmutabilidad.
 */
describe("bundles env.<entorno>", () => {
  it("declaran su Entorno y congelan el objeto", () => {
    expect(envProd.entorno).toBe("prod");
    expect(envDev.entorno).toBe("dev");
    expect(envTest.entorno).toBe("test");
    for (const bundle of [envProd, envDev, envTest]) {
      expect(Object.isFrozen(bundle)).toBe(true);
    }
  });

  it("mantienen los puertos y URLs canónicos", () => {
    expect(envProd.port).toBe(8085);
    expect(envDev.port).toBe(3000);
    expect(envTest.port).toBe(3001);
    expect(envProd.modelGatewayUrl).toBe("http://127.0.0.1:4000");
    expect(envDev.modelGatewayUrl).toBe("http://127.0.0.1:4000");
    expect(envTest.modelGatewayUrl).toBe("http://127.0.0.1:4001");
    expect(envProd.codingAgentWorkerPort).toBe(3015);
    expect(envDev.codingAgentWorkerPort).toBe(3016);
    expect(envTest.codingAgentWorkerUrl).toBe(
      "http://localhost:3001/api/agent/code/worker-stub",
    );
  });

  it("aíslan el runtime Pi de dev y test bajo packages/coding-agent/.pi-<env>", () => {
    expect(envDev.codingAgentAuthJson).toBe(packagePath("coding-agent", ".pi-dev/auth.json"));
    expect(envDev.codingAgentModelsJson).toBe(packagePath("coding-agent", ".pi-dev/models.json"));
    expect(envDev.codingAgentAgentDir).toBe(packagePath("coding-agent", ".pi-dev/agent"));
    expect(envDev.codingAgentSessionsDir).toBe(packagePath("coding-agent", ".pi-dev/sessions"));
    expect(envDev.codingAgentArtifactsDir).toBe(packagePath("coding-agent", ".pi-dev/artifacts"));
    expect(envDev.codingAgentPiPackagesDir).toBe(packagePath("coding-agent", ".pi-dev/packages"));
    expect(envDev.traceDir).toBe(packagePath("coding-agent", ".pi-dev/traces"));

    expect(envTest.codingAgentAuthJson).toBe(packagePath("coding-agent", ".pi-test/auth.json"));
    expect(envTest.codingAgentModelsJson).toBe(packagePath("coding-agent", ".pi-test/models.json"));
    expect(envTest.codingAgentSessionsDir).toBe(packagePath("coding-agent", ".pi-test/sessions"));
    expect(envTest.traceDir).toBe(packagePath("coding-agent", ".pi-test/traces"));
  });

  it("conserva la continuidad de Producción (ADR 0002)", () => {
    expect(envProd.codingAgentSessionsDir).toBe(homePath("coding-agent", "sessions"));
    expect(envProd.codingAgentProjectsRoot).toBe(repoPath(".."));
    expect(envProd.codingAgentAuthJson).toBe(packagePath("coding-agent", ".pi-prod/auth.json"));
    expect(envProd.traceDir).toBe(packagePath("coding-agent", ".pi-prod/traces"));
    expect(envProd.codingAgentArtifactsUrl).toBe("http://192.168.18.50:3015");
  });

  it("no comparten ningún directorio de runtime entre Entornos", () => {
    const dirs = (bundle: AppConfig) => [
      bundle.codingAgentAuthJson,
      bundle.codingAgentModelsJson,
      bundle.codingAgentAgentDir,
      bundle.codingAgentPiPackagesDir,
      bundle.codingAgentArtifactsDir,
      bundle.traceDir,
    ];
    const prod = dirs(envProd);
    const dev = dirs(envDev);
    const test = dirs(envTest);
    for (const [index, dir] of dev.entries()) {
      expect(dir).not.toBe(prod[index]);
      expect(dir).not.toBe(test[index]);
    }
  });

  it("los secretos de test son deterministas y falsos", () => {
    expect(envTest.postgresUrl).toBe("postgres://postgres:postgres@127.0.0.1:5434/test");
    expect(envTest.modelGatewayApiKey).toBe("test-gateway-key");
    expect(envTest.authSecret).toBe("test_secret");
  });

  it("los config.<env> estructurales satisfacen el contrato sin secretos", () => {
    for (const structural of [configProd, configDev, configTest]) {
      expect("postgresUrl" in structural).toBe(false);
      expect("modelGatewayApiKey" in structural).toBe(false);
    }
  });
});

describe("guardarraíles Entorno ↔ DB ↔ Gateway", () => {
  it("aceptan el DSN y el Gateway de su propio Entorno", () => {
    expect(assertDbMatchesEntorno(envTest.postgresUrl, "test")).toBe(envTest.postgresUrl);
    expect(assertGatewayMatchesEntorno(envTest.modelGatewayUrl, "test")).toBe(
      envTest.modelGatewayUrl,
    );
  });

  it("rechazan el DSN de otro Entorno", () => {
    expect(() => assertDbMatchesEntorno(envDev.postgresUrl, "prod")).toThrow(ConfigError);
    expect(() => assertDbMatchesEntorno(envDev.postgresUrl, "prod")).toThrow(/5435\/prod/);
  });

  it("rechazan el Gateway real en test", () => {
    expect(() => assertGatewayMatchesEntorno("http://127.0.0.1:4000", "test")).toThrow(
      /4001/,
    );
  });

  it("validateAppConfig valida un bundle completo", () => {
    expect(validateAppConfig(envTest)).toBe(envTest);
    expect(() =>
      validateAppConfig({ ...envTest, postgresUrl: envProd.postgresUrl }),
    ).toThrow(ConfigError);
  });
});
