import "server-only";

import { gatewayBaseUrl, gatewayHeaders } from "./gateway";
import type { GatewayModelEntry } from "@/lib/features/foundation-model/config";

/**
 * Cliente del catálogo de modelos del Gateway (`GET /v1/models/catalog`,
 * contrato compartido §1). El Gateway filtra en servidor, pero el snapshot
 * se pide con `?include_internal=true`: además de los modelos
 * user-invocable (los que alimenta al `<ModelCatalogProvider>`), trae los 10
 * Default Model Contracts (`*-default`), cuyos metadatos consume
 * `languageModel()` al construir la configuración de un contrato. Los helpers
 * isomorfos del cliente (`chatModelKeys`, `defaultModel`, …) excluyen los
 * contratos del picker, así que el listado user-visible no cambia.
 */

const CATALOG_TTL_MS = 60_000;

interface CatalogCache {
  models: GatewayModelEntry[];
  expiresAt: number;
}

/** Caché en memoria de servidor (TTL 60 s): un snapshot por proceso. */
let cache: CatalogCache | undefined;

/**
 * Descarga (o reutiliza del caché) el catálogo completo del Gateway.
 * Lanza si el Gateway no responde o devuelve un body inesperado — el fallo
 * es de infraestructura y no tiene fallback razonable.
 */
export async function fetchModelCatalog(): Promise<GatewayModelEntry[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.models;

  const response = await fetch(`${gatewayBaseUrl()}/models/catalog?include_internal=true`, {
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

  cache = { models: body.models, expiresAt: Date.now() + CATALOG_TTL_MS };
  return cache.models;
}

/**
 * Calienta el caché del catálogo. Punto de calentamiento acordado: el
 * `(chat)/layout.tsx` (server) lo llama antes de hidratar
 * `<ModelCatalogProvider>`, y `processChatResponse` antes de construir el
 * adaptador de agente — así `languageModel()`/`createAgent()` pueden seguir
 * siendo síncronos en los API routes.
 */
export async function warmModelCatalog(): Promise<void> {
  await fetchModelCatalog();
}

/**
 * Snapshot ya cargado del catálogo (síncrono). Lanza con un error claro si
 * el caché está frío: los consumidores deben pasar por un punto de
 * calentamiento (`warmModelCatalog`/`fetchModelCatalog`) antes de resolver
 * modelos.
 */
export function getModelCatalogSnapshot(): GatewayModelEntry[] {
  if (!cache) {
    throw new Error(
      "Model catalog is cold: call `await warmModelCatalog()` (server) before resolving models synchronously",
    );
  }
  return cache.models;
}
