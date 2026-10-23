import type { WorkerRuntimeConfig } from "./runtime-config";

/**
 * Process-wide worker runtime overrides (ADR 0011 §6).
 *
 * Composition root only: `startHttpTransport()` resolves the worker config
 * (`defaultWorkerRuntimeConfig()`, or the options a test injects) and registers
 * it here once, so the module-level singletons of the session-manager facade
 * and the Pi extensions share one config without each call site plumbing a
 * parameter. Tests that touch those singletons register their sandbox the same
 * way (`setWorkerRuntimeConfig`) and MUST call `resetWorkerRuntimeConfigForTests()`
 * in `afterEach`/`afterAll`.
 *
 * Everything else receives the config explicitly: `resolveGatewayRuntimeConfig`,
 * `resolveWorkerRuntimeConfig` and the path resolvers merge (explicit overrides
 * > these process-wide overrides > Entorno bundle > package fallback).
 *
 * Note for the Pi extensions: `jiti` re-evaluates the extension entrypoints
 * into a second module instance that gets its own empty copy of this module. That is
 * safe because the composition root only ever registers values equal to the
 * Entorno bundle defaults, so the second instance resolves the same paths from
 * the bundle (same reason both copies can read `config`).
 */
let overrides: WorkerRuntimeConfig = {};

/** Register the process-wide worker config. Called by the composition root. */
export function setWorkerRuntimeConfig(config: WorkerRuntimeConfig): void {
  overrides = { ...config };
}

/** Current process-wide worker config (empty when nobody registered one). */
export function getWorkerRuntimeConfig(): WorkerRuntimeConfig {
  return overrides;
}

/** Test hook: drop the process-wide overrides (call it from afterEach/afterAll). */
export function resetWorkerRuntimeConfigForTests(): void {
  overrides = {};
}
