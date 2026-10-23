import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";
import {
  PACKAGE_ROOT,
  getArtifactsBaseUrl,
  getArtifactsDir,
  getCodingAgentDir,
  getSessionsDir,
  resolveArtifactsBaseUrl,
  resolveArtifactsDir,
  resolveCodingAgentDir,
  resolveProjectsRoot,
  resolveSessionsDir,
} from "../../src/runtime/paths";
import { getAuthJsonPath, resolveAuthJsonPath } from "../../src/runtime/models";
import { getPiPackagesDir, resolvePiPackagesDir } from "../../src/runtime/pi-packages";
import { resolveWorkerRuntimeConfig } from "../../src/runtime/runtime-config";
import { createTestWorkerContext } from "../helpers/test-context";

/**
 * Aislamiento del runtime Pi por Entorno (ADR 0002 v2 + ADR 0011 §6).
 *
 * La continuidad de prod (literales absolutos intactos) vive en
 * `packages/config/tests/unit/env-bundles.test.ts`; aquí se cubre lo que
 * corre en la suite de tests: los defaults del Entorno de Test (bundle
 * `env.test.ts` enlazado por el alias de vitest) y que los overrides por DI
 * ganan y quedan dentro del sandbox temporal del test. Ningún `process.env`
 * participa: la configuración por variables de entorno murió con ADR 0011.
 */
describe("per-Entorno Pi runtime paths (defaults del Entorno de Test)", () => {
  it("resolves every default inside packages/coding-agent/.pi-test", () => {
    expect(getCodingAgentDir()).toBe(path.join(PACKAGE_ROOT, ".pi-test", "agent"));
    expect(getAuthJsonPath()).toBe(path.join(PACKAGE_ROOT, ".pi-test", "auth.json"));
    expect(getArtifactsDir()).toBe(path.join(PACKAGE_ROOT, ".pi-test", "artifacts"));
    expect(getSessionsDir()).toBe(path.join(PACKAGE_ROOT, ".pi-test", "sessions"));
    expect(getPiPackagesDir()).toBe(path.join(PACKAGE_ROOT, ".pi-test", "packages"));
  });

  it("defaults auth.json to the worker-owned agent dir of the Entorno, never ~/.pi/agent", () => {
    const auth = getAuthJsonPath();
    expect(auth).toBe(path.join(PACKAGE_ROOT, ".pi-test", "auth.json"));
    expect(auth.startsWith(path.join(os.homedir(), ".pi"))).toBe(false);
  });
});

describe("DI: los overrides por constructor ganan y quedan dentro del sandbox", () => {
  it("replaces every runtime dir with the sandbox paths", () => {
    const ctx = createTestWorkerContext();
    try {
      expect(resolveSessionsDir(ctx.workerConfig)).toBe(ctx.sessionsDir);
      expect(resolveCodingAgentDir(ctx.workerConfig)).toBe(ctx.agentDir);
      expect(resolveAuthJsonPath(ctx.workerConfig)).toBe(ctx.authJsonPath);
      expect(resolveArtifactsDir(ctx.workerConfig)).toBe(ctx.artifactsDir);
      expect(resolvePiPackagesDir(ctx.workerConfig)).toBe(ctx.piPackagesDir);
      expect(resolveProjectsRoot(ctx.workerConfig)).toBe(ctx.projectsRoot);

      for (const resolved of [
        resolveSessionsDir(ctx.workerConfig),
        resolveCodingAgentDir(ctx.workerConfig),
        resolveAuthJsonPath(ctx.workerConfig),
        resolveArtifactsDir(ctx.workerConfig),
        resolvePiPackagesDir(ctx.workerConfig),
        resolveProjectsRoot(ctx.workerConfig),
      ]) {
        expect(resolved.startsWith(ctx.root + path.sep)).toBe(true);
      }

      // El config resuelto del worker entero apunta al sandbox (los defaults
      // del Entorno siguen intactos: nada escribió en `.pi-test`).
      const resolved = resolveWorkerRuntimeConfig(ctx.workerConfig);
      expect(resolved.sessionsDir).toBe(ctx.sessionsDir);
      expect(resolved.agentDir).toBe(ctx.agentDir);
      expect(resolved.authJsonPath).toBe(ctx.authJsonPath);
      expect(resolved.modelsJsonPath).toBe(ctx.modelsJsonPath);
      expect(getSessionsDir()).toBe(path.join(PACKAGE_ROOT, ".pi-test", "sessions"));
    } finally {
      ctx.cleanup();
    }
  });
});

describe("resolveArtifactsBaseUrl", () => {
  it("defaults to the worker URL of the Entorno", () => {
    // config.test.ts: codingAgentWorkerUrl = stub de test en :3001.
    expect(getArtifactsBaseUrl()).toBe(
      "http://localhost:3001/api/agent/code/worker-stub",
    );
  });

  it("prefers an explicit base URL and strips trailing slashes", () => {
    expect(resolveArtifactsBaseUrl({ artifactsBaseUrl: "http://127.0.0.1:9/" })).toBe(
      "http://127.0.0.1:9",
    );
    expect(resolveArtifactsBaseUrl({ artifactsBaseUrl: "" })).toBe(getArtifactsBaseUrl());
  });

  it("derives localhost:<port> from an injected workerPort", () => {
    expect(resolveArtifactsBaseUrl({ workerPort: 3999 })).toBe("http://localhost:3999");
  });
});
