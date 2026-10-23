import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveModelsJsonPath, getModelsJsonPath } from "../../src/runtime/models";
import { resolveCodingAgentDir, getCodingAgentDir, PACKAGE_ROOT } from "../../src/runtime/paths";
import { createTestWorkerContext } from "../helpers/test-context";

/**
 * Resolución del models.json por DI (ADR 0011 §6): el override explícito gana,
 * vacío = sin definir, los relativos se anclan al paquete y el default es el
 * models.json del Entorno de Test. Ninguna de estas rutas sale de `process.env`.
 */
describe("resolveModelsJsonPath", () => {
  it("honours an explicit modelsJsonPath override", () => {
    expect(resolveModelsJsonPath({ modelsJsonPath: "/tmp/custom-models.json" })).toBe(
      "/tmp/custom-models.json",
    );
  });

  it("defaults to the models.json of the active Entorno (test)", () => {
    // Entorno de Test (bundle `env.test.ts` enlazado por vitest.config.ts):
    // `.pi-test/models.json` dentro del paquete.
    expect(getModelsJsonPath()).toBe(path.join(PACKAGE_ROOT, ".pi-test", "models.json"));
    expect(getModelsJsonPath()).toBe(resolveModelsJsonPath({}));
  });

  it("treats an empty override as unset (falls back to the Entorno default)", () => {
    // Playwright's web server forwards unset variables as empty strings.
    expect(resolveModelsJsonPath({ modelsJsonPath: "" })).toBe(getModelsJsonPath());
    expect(resolveModelsJsonPath({ modelsJsonPath: "" })).toMatch(/models\.json$/);
  });

  it("anchors a relative override to the coding-agent package", () => {
    // The cwd differs between the worker, the chatbot and the test runners, so
    // a relative override must not resolve against it.
    expect(resolveModelsJsonPath({ modelsJsonPath: ".pi/models.json" })).toBe(
      path.join(PACKAGE_ROOT, ".pi", "models.json"),
    );
  });

  it("supports an isolated agent directory override", () => {
    expect(resolveCodingAgentDir({ agentDir: ".pi/custom-agent" })).toBe(
      path.join(PACKAGE_ROOT, ".pi", "custom-agent"),
    );
  });

  it("keeps a sandboxed DI override inside the test context", () => {
    const ctx = createTestWorkerContext();
    try {
      expect(resolveModelsJsonPath(ctx.workerConfig)).toBe(ctx.modelsJsonPath);
      // Sin modelsJsonPath explícito, cae al agentDir inyectado.
      expect(resolveModelsJsonPath({ agentDir: ctx.agentDir })).toBe(
        path.join(ctx.agentDir, "models.json"),
      );
      expect(resolveCodingAgentDir(ctx.workerConfig)).toBe(ctx.agentDir);
      expect(getCodingAgentDir()).not.toBe(ctx.agentDir); // el default del Entorno no se muta
    } finally {
      ctx.cleanup();
    }
  });
});
