import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { WorkerRuntimeConfig } from "../../src/runtime/runtime-config";

/**
 * Canonical DI context for Coding Agent Worker tests (ADR 0011 §6 / ticket 02).
 *
 * Every path a test observes — sessions, models.json, auth.json, agent dir,
 * Pi packages, artifacts, traces, project root — lives inside ONE temp sandbox
 * unique to the test (`mkdtempSync` under `os.tmpdir()`). No test may configure
 * itself through `process.env.CODING_AGENT_*` / `process.env.MODEL_GATEWAY_*`;
 * `tests/contract/no-process-env-mutations.test.ts` enforces that.
 *
 * Usage:
 * ```ts
 * let ctx: TestWorkerContext;
 * beforeEach(() => { ctx = createTestWorkerContext(); });
 * afterEach(() => { ctx.cleanup(); }); // borra el sandbox completo
 *
 * const registry = new SessionRegistry(undefined, ctx.workerConfig);
 * await syncGatewayModelsFile({ ...ctx.workerConfig, gatewayUrl, apiKey });
 * ```
 *
 * `cleanup()` deletes the whole sandbox (`rmSync(root, { recursive, force })`)
 * — call it from `afterEach` (or `afterAll` for suite-wide contexts).
 */
export interface TestWorkerContextPaths {
  /** Sandbox root (`mkdtempSync`); every other path is inside it. */
  root: string;
  /** Root of the per-project checkouts (`<root>/projects`). */
  projectsRoot: string;
  /** Pi session transcripts (`<root>/sessions`). */
  sessionsDir: string;
  /** Gateway-synced Pi models.json (`<root>/models.json`). */
  modelsJsonPath: string;
  /** Per-test Gateway credentials (`<root>/auth.json`). */
  authJsonPath: string;
  /** Worker-owned Pi agent dir (`<root>/agent`). */
  agentDir: string;
  /** Worker-owned Pi package checkouts (`<root>/pi-packages`). */
  piPackagesDir: string;
  /** Published artifacts root (`<root>/artifacts`). */
  artifactsDir: string;
  /** Tracing output (`<root>/traces`); informational — the tracing lib reads its own config. */
  traceDir: string;
}

export interface TestWorkerContext extends TestWorkerContextPaths {
  /** Worker config pointing every path (and the optional gateway fields passed as overrides) at the sandbox. */
  workerConfig: WorkerRuntimeConfig;
  /** Deletes the whole sandbox. Call from `afterEach`/`afterAll`. */
  cleanup: () => void;
}

export type TestWorkerContextOverrides = Partial<
  TestWorkerContextPaths & WorkerRuntimeConfig
>;

/**
 * Build an isolated worker context for one test. Pass overrides to pin a path
 * or a gateway field; anything not overridden is created under the fresh
 * sandbox. Never reads or writes `process.env`.
 */
export function createTestWorkerContext(
  overrides: TestWorkerContextOverrides = {},
): TestWorkerContext {
  const root = overrides.root ?? mkdtempSync(path.join(os.tmpdir(), "ca-test-"));
  const inside = (relative: string): string => path.join(root, relative);

  const projectsRoot = overrides.projectsRoot ?? inside("projects");
  const sessionsDir = overrides.sessionsDir ?? inside("sessions");
  const modelsJsonPath = overrides.modelsJsonPath ?? inside("models.json");
  const authJsonPath = overrides.authJsonPath ?? inside("auth.json");
  const agentDir = overrides.agentDir ?? inside("agent");
  const piPackagesDir = overrides.piPackagesDir ?? inside("pi-packages");
  const artifactsDir = overrides.artifactsDir ?? inside("artifacts");
  const traceDir = overrides.traceDir ?? inside("traces");

  for (const dir of [projectsRoot, sessionsDir, agentDir, piPackagesDir, artifactsDir, traceDir]) {
    mkdirSync(dir, { recursive: true });
  }

  const workerConfig: WorkerRuntimeConfig = {
    projectsRoot,
    sessionsDir,
    modelsJsonPath,
    authJsonPath,
    agentDir,
    piPackagesDir,
    artifactsDir,
    ...(overrides.gatewayUrl !== undefined ? { gatewayUrl: overrides.gatewayUrl } : {}),
    ...(overrides.apiKey !== undefined ? { apiKey: overrides.apiKey } : {}),
    ...(overrides.artifactsBaseUrl !== undefined
      ? { artifactsBaseUrl: overrides.artifactsBaseUrl }
      : {}),
    ...(overrides.workerPort !== undefined ? { workerPort: overrides.workerPort } : {}),
  };

  return {
    root,
    projectsRoot,
    sessionsDir,
    modelsJsonPath,
    authJsonPath,
    agentDir,
    piPackagesDir,
    artifactsDir,
    traceDir,
    workerConfig,
    cleanup: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
