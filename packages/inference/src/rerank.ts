import { rerank as sdkRerank } from "ai";
import {
  RERANK_MODELS,
  RERANK_ROLES,
  type RerankModelCatalogEntry,
  type RerankRole,
} from "models";
import type { RerankClients } from "./clients/rerank";
import type { RerankArgs, RerankResult } from "./types";

const catalogById = new Map<string, RerankModelCatalogEntry>(
  RERANK_MODELS.map((entry) => [entry.id, entry]),
);

function resolveRerankEntry(role: RerankRole): RerankModelCatalogEntry {
  const id: string = RERANK_ROLES[role];
  const entry = catalogById.get(id);
  if (!entry) {
    throw new Error(
      `Rerank role "${role}" points at catalog id "${id}", which is not in RERANK_MODELS`,
    );
  }
  return entry;
}

/**
 * Builds `rerank(role, args)`: resolves a Rerank Role to its `RERANK_MODELS`
 * entry and runs the AI SDK's `rerank()` against it, returning
 * `{ originalIndex, score }[]` — the same shape `Providers.rerank()` shimmed
 * before this operation existed.
 */
export function createRerankResolver(
  clients: RerankClients,
): (role: RerankRole, args: RerankArgs) => Promise<RerankResult[]> {
  return async (role, args) => {
    const entry = resolveRerankEntry(role);
    const model = clients[entry.provider.kind](entry.provider.modelId);
    const { ranking } = await sdkRerank({ ...args, model });
    return ranking;
  };
}
