import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveModelsJsonPath, getModelsJsonPath } from "../../src/runtime/models";
import { resolveCodingAgentDir, getCodingAgentDir, PACKAGE_ROOT } from "../../src/runtime/paths";
import { createTestWorkerContext } from "../helpers/test-context";

/**
 * models.json resolution through DI (ADR 0011 §6): the explicit override wins,
 * empty = unset, relative paths anchor to the package and the default is the
 * Test Environment's models.json. None of these paths comes from `process.env`.
 */
describe("resolveModelsJsonPath", () => {
  it("honours an explicit modelsJsonPath override", () => {
    expect(resolveModelsJsonPath({ modelsJsonPath: "/tmp/custom-models.json" })).toBe(
      "/tmp/custom-models.json",
    );
  });

  it("defaults to the models.json of the active Environment (test)", () => {
    // Test Environment (bundle `env.test.ts` bound by vitest.config.ts):
    // `.pi-test/models.json` inside the package.
    expect(getModelsJsonPath()).toBe(path.join(PACKAGE_ROOT, ".pi-test", "models.json"));
    expect(getModelsJsonPath()).toBe(resolveModelsJsonPath({}));
  });

  it("treats an empty override as unset (falls back to the Environment default)", () => {
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
      // Without an explicit modelsJsonPath, it falls back to the injected agentDir.
      expect(resolveModelsJsonPath({ agentDir: ctx.agentDir })).toBe(
        path.join(ctx.agentDir, "models.json"),
      );
      expect(resolveCodingAgentDir(ctx.workerConfig)).toBe(ctx.agentDir);
      expect(getCodingAgentDir()).not.toBe(ctx.agentDir); // the Environment default is not mutated
    } finally {
      ctx.cleanup();
    }
  });
});
