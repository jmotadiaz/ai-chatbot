import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { getTraceLogger } from "tracing";
import { ensureGatewayModelsJson, getSyncedGatewayCatalog, syncGatewayModelsFile } from "./gateway-catalog";
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
  runtimePromise ??= (async () => {
    // Sync the runtime catalog from the Model Gateway BEFORE building the
    // file-backed runtime: models.json/auth.json must describe the single
    // `model-gateway` provider, and a dead Gateway must fail fast instead of
    // silently starting with an empty model list.
    await ensureGatewayModelsJson();
    return ModelRuntime.create({
      authPath: getAuthJsonPath(),
      modelsPath: getModelsJsonPath(),
      allowModelNetwork: false,
      refreshOnCreate: false,
    });
  })().catch((error) => {
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

// --- Runtime Model Catalog refresh (hot reload) -----------------------------

let refreshInFlight: Promise<void> | undefined;

/**
 * Re-sync the Model Catalog from the Gateway so a model published in
 * `config.yaml` reaches the code-chat picker without a worker restart
 * (ADR 0010). Called by `getAvailableModels()` before every availability
 * read — no TTL: the read is SSR-only and the refresh costs ~20 ms, hidden
 * behind the SSR `Promise.all`.
 *
 * In-flight deduplication: concurrent callers share the same refresh instead
 * of stacking fetches/rewrites.
 *
 * Failure policy: if the Gateway is unreachable mid-life, the last good
 * catalog (in-memory snapshot + `models.json` + `ModelRuntime` state) is
 * kept and the failure is logged as a warning — `getAvailableModels` answers
 * with what it already has. With no catalog yet (cold start) the initial
 * load behavior is preserved: the error propagates.
 */
export function refreshGatewayCatalog(): Promise<void> {
  refreshInFlight ??= refreshOnce().finally(() => {
    refreshInFlight = undefined;
  });
  return refreshInFlight;
}

async function refreshOnce(): Promise<void> {
  const log = getTraceLogger("worker");
  // Cold start: the lazy initial sync (`ensureGatewayModelsJson` inside
  // `getModelRuntime`) already fetches the catalog — just build the runtime
  // and let its errors propagate, as the startup path always did.
  if (getSyncedGatewayCatalog().length === 0) {
    await getModelRuntime();
    return;
  }
  try {
    const catalog = await syncGatewayModelsFile();
    const runtime = await getModelRuntime();
    // Re-read the rewritten models.json into the live runtime (file-backed,
    // `allowNetwork: false` — no provider network refresh) so new ids resolve
    // through the shared instance sessions already hold.
    await runtime.refresh({ allowNetwork: false });
    log.info("gateway.catalog.refreshed", { models: catalog.length });
  } catch (error) {
    // Keep the last good catalog; a dead Gateway must not take
    // getAvailableModels (and with it the SSR of the code-chat page) down.
    log.warn("gateway.catalog.refresh_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
