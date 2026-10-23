import "server-only";

import { gatewayBaseUrl, gatewayHeaders } from "./gateway";
import type { GatewayModelEntry } from "@/lib/features/foundation-model/config";

/**
 * Gateway model catalog client (`GET /v1/models/catalog`,
 * spec §2.2/§5.3): the `user_invocable` filtering is done by the Gateway
 * SERVER-SIDE. Two separate views:
 *
 * - **Public** (`fetchPublicModelCatalog`, no `include_internal`): the 14
 *   user-invocable models. This is what gets hydrated to the browser via
 *   `<ModelCatalogProvider>` and what the UI helpers consume
 *   (`chatModelKeys`, `defaultModel`, …) — the `*-default` contracts NEVER
 *   reach the client.
 * - **Internal** (`fetchInternalModelCatalog`, `?include_internal=true`):
 *   public + the 10 Default Model Contracts; server only, to resolve
 *   the contracts' metadata in `languageModel()`.
 */

const CATALOG_TTL_MS = 60_000;

interface CatalogCache {
  models: GatewayModelEntry[];
  expiresAt: number;
}

/** In-memory server cache (60 s TTL): one snapshot per process and view. */
let publicCache: CatalogCache | undefined;
let internalCache: CatalogCache | undefined;

async function fetchCatalog(
  includeInternal: boolean,
  cache: CatalogCache | undefined,
): Promise<{ models: GatewayModelEntry[]; cache: CatalogCache }> {
  if (cache && cache.expiresAt > Date.now()) {
    return { models: cache.models, cache };
  }

  const query = includeInternal ? "?include_internal=true" : "";
  const response = await fetch(`${gatewayBaseUrl()}/models/catalog${query}`, {
    headers: gatewayHeaders(),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      `Model catalog request failed: ${response.status} ${response.statusText}`,
    );
  }
  const body = (await response.json()) as { models?: GatewayModelEntry[] };
  if (!Array.isArray(body.models)) {
    throw new Error("Model catalog response has no `models` array");
  }

  const next = { models: body.models, expiresAt: Date.now() + CATALOG_TTL_MS };
  return { models: next.models, cache: next };
}

/**
 * Public catalog (user-invocable models, WITHOUT the `*-default`
 * contracts). It is the one hydrated into `<ModelCatalogProvider>`.
 */
export async function fetchPublicModelCatalog(): Promise<GatewayModelEntry[]> {
  const { models, cache } = await fetchCatalog(false, publicCache);
  publicCache = cache;
  return models;
}

/**
 * Internal catalog (public + the `*-default` contracts), server only:
 * `languageModel()` queries it to resolve a contract's metadata.
 */
export async function fetchInternalModelCatalog(): Promise<GatewayModelEntry[]> {
  const { models, cache } = await fetchCatalog(true, internalCache);
  internalCache = cache;
  return models;
}

/**
 * Warms both caches. Agreed warm-up point:
 * `processChatResponse` before building the agent adapter — that way
 * `languageModel()`/`createAgent()` can stay synchronous in the
 * API routes. The client hydration is done by `app/(chat)/layout.tsx`
 * with `fetchPublicModelCatalog()` (the internal catalog never leaves the
 * server).
 */
export async function warmModelCatalog(): Promise<void> {
  await Promise.all([fetchPublicModelCatalog(), fetchInternalModelCatalog()]);
}

/**
 * Full snapshot (public + contracts) already loaded, for synchronous
 * server reads. It throws with a clear error if the cache is cold:
 * consumers must go through a warm-up point
 * (`warmModelCatalog`/`fetchInternalModelCatalog`) before resolving
 * models.
 */
export function getModelCatalogSnapshot(): GatewayModelEntry[] {
  if (!internalCache) {
    throw new Error(
      "Model catalog is cold: call `await warmModelCatalog()` (server) before resolving models synchronously",
    );
  }
  return internalCache.models;
}

/**
 * Snapshot of the already loaded PUBLIC catalog (the user-invocable ones, without
 * contracts): the one hydrated to the browser. It throws if the cache is cold.
 */
export function getPublicModelCatalogSnapshot(): GatewayModelEntry[] {
  if (!publicCache) {
    throw new Error(
      "Public model catalog is cold: call `await fetchPublicModelCatalog()` (server) before reading it synchronously",
    );
  }
  return publicCache.models;
}
