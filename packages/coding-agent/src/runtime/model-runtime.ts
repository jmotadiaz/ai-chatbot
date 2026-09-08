import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { getTraceLogger } from "tracing";
import { getAuthJsonPath, getModelsJsonPath } from "./models";

/**
 * Process-wide `ModelRuntime` singleton (pi SDK ≥ 0.80.8).
 *
 * The SDK replaced the old synchronous `AuthStorage` + `ModelRegistry` pair
 * with a single async facade that owns credentials (auth.json), the model
 * catalog (models.json), provider composition, and request-auth assembly.
 * `ModelRuntime.create()` restores caches and composes providers, so it is
 * too heavy — and too lock-prone on `auth.json` — to build per session.
 * Sessions (including subagent runtimes) therefore share one instance.
 *
 * `ModelRuntime` is NOT bound to a cwd: `authPath` and `modelsPath` are
 * resolved here against this package (ADR 0002 v2 — per-environment paths,
 * never the machine-wide `~/.pi/agent`), so sharing across sessions cannot
 * leak credentials between environments.
 *
 * Network parity with the pre-0.80.8 behavior: catalog creation stays
 * file-backed only (`allowModelNetwork: false`, `refreshOnCreate: false`).
 * The worker never refreshes provider catalogs at runtime; call
 * `runtime.refresh()` explicitly if that ever changes.
 */
let runtimePromise: Promise<ModelRuntime> | undefined;

export function getModelRuntime(): Promise<ModelRuntime> {
  runtimePromise ??= ModelRuntime.create({
    authPath: getAuthJsonPath(),
    modelsPath: getModelsJsonPath(),
    allowModelNetwork: false,
    refreshOnCreate: false,
  }).catch((error) => {
    // Allow a later caller to retry instead of caching a rejected promise.
    runtimePromise = undefined;
    getTraceLogger("worker").error("modelruntime.create_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  });
  return runtimePromise;
}

/** Test hook: drop the cached instance so the next call rebuilds it. */
export function resetModelRuntimeForTests(): void {
  runtimePromise = undefined;
}
