import "server-only";

import { gatewayBaseUrl, gatewayHeaders } from "./gateway";
import type { GatewayModelEntry } from "@/lib/features/foundation-model/config";

/**
 * Cliente del catálogo de modelos del Gateway (`GET /v1/models/catalog`,
 * spec §2.2/§5.3): el filtrado `user_invocable` lo hace el Gateway EN
 * SERVIDOR. Dos vistas separadas:
 *
 * - **Público** (`fetchPublicModelCatalog`, sin `include_internal`): los 14
 *   modelos user-invocable. Es lo que se hidrata al browser vía
 *   `<ModelCatalogProvider>` y lo que consumen los helpers de UI
 *   (`chatModelKeys`, `defaultModel`, …) — los contratos `*-default` NUNCA
 *   llegan al cliente.
 * - **Interno** (`fetchInternalModelCatalog`, `?include_internal=true`):
 *   público + los 10 Default Model Contracts; solo servidor, para resolver
 *   los metadatos de los contratos en `languageModel()`.
 */

const CATALOG_TTL_MS = 60_000;

interface CatalogCache {
  models: GatewayModelEntry[];
  expiresAt: number;
}

/** Caché en memoria de servidor (TTL 60 s): un snapshot por proceso y vista. */
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
 * Catálogo público (modelos user-invocable, SIN los contratos
 * `*-default`). Es el que va hidratado al `<ModelCatalogProvider>`.
 */
export async function fetchPublicModelCatalog(): Promise<GatewayModelEntry[]> {
  const { models, cache } = await fetchCatalog(false, publicCache);
  publicCache = cache;
  return models;
}

/**
 * Catálogo interno (público + los contratos `*-default`), solo servidor:
 * `languageModel()` lo consulta para resolver los metadatos de un contrato.
 */
export async function fetchInternalModelCatalog(): Promise<GatewayModelEntry[]> {
  const { models, cache } = await fetchCatalog(true, internalCache);
  internalCache = cache;
  return models;
}

/**
 * Calienta ambos cachés. Punto de calentamiento acordado:
 * `processChatResponse` antes de construir el adaptador de agente — así
 * `languageModel()`/`createAgent()` pueden seguir siendo síncronos en los
 * API routes. La hidratación del cliente la hace `app/(chat)/layout.tsx`
 * con `fetchPublicModelCatalog()` (el catálogo interno no sale del
 * servidor).
 */
export async function warmModelCatalog(): Promise<void> {
  await Promise.all([fetchPublicModelCatalog(), fetchInternalModelCatalog()]);
}

/**
 * Snapshot completo (público + contratos) ya cargado, para lecturas
 * síncronas en servidor. Lanza con un error claro si el caché está frío:
 * los consumidores deben pasar por un punto de calentamiento
 * (`warmModelCatalog`/`fetchInternalModelCatalog`) antes de resolver
 * modelos.
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
 * Snapshot del catálogo PÚBLICO ya cargado (los user-invocable, sin
 * contratos): el que se hidrata al browser. Lanza si el caché está frío.
 */
export function getPublicModelCatalogSnapshot(): GatewayModelEntry[] {
  if (!publicCache) {
    throw new Error(
      "Public model catalog is cold: call `await fetchPublicModelCatalog()` (server) before reading it synchronously",
    );
  }
  return publicCache.models;
}
