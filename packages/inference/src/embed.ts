import { embedMany } from "ai";
import {
  EMBEDDING_MODELS,
  EMBEDDING_ROLES,
  resolveCatalogEntry,
  type EmbeddingModelCatalogEntry,
  type EmbeddingModelId,
  type EmbeddingRole,
} from "models";
import type { EmbeddingClients } from "./clients/embedding";
import type { EmbedOptions } from "./types";

const catalogById = new Map<EmbeddingModelId, EmbeddingModelCatalogEntry>(
  EMBEDDING_MODELS.map((entry) => [entry.id, entry]),
);

function resolveEmbeddingEntry(role: EmbeddingRole): EmbeddingModelCatalogEntry {
  return resolveCatalogEntry<EmbeddingModelId, EmbeddingModelCatalogEntry, EmbeddingRole>(
    catalogById,
    role,
    { kind: "Embedding role", catalogName: "EMBEDDING_MODELS" },
    EMBEDDING_ROLES,
  ).entry;
}

/**
 * Builds `embed(role, values, options)`: resolves an Embedding Role to its
 * `EMBEDDING_MODELS` entry, validates the caller's `taskType` against what
 * that entry declares supported, and applies the catalog's own output
 * dimensionality — the same shape every RAG/memory call site hardcoded
 * before this operation existed (768 for `gemini-embedding-001`, a
 * deliberate truncation of its native size, not its default).
 */
export function createEmbedResolver(
  clients: EmbeddingClients,
): (role: EmbeddingRole, values: string[], options: EmbedOptions) => Promise<number[][]> {
  return async (role, values, { taskType }) => {
    const entry = resolveEmbeddingEntry(role);
    if (!entry.taskTypes.includes(taskType)) {
      throw new Error(
        `Embedding role "${role}" (${entry.id}) does not support taskType "${taskType}"; supported: ${entry.taskTypes.join(", ")}`,
      );
    }

    const model = clients[entry.provider.kind](entry.provider.modelId);
    // `EmbeddingProviderKind` is "google" only today, so the provider-options
    // key below is not dynamic; a second embedding kind would need its own
    // branch here (each operation catalog has its own shape by design — see
    // the spec's "no se fuerza una unión discriminada").
    const { embeddings } = await embedMany({
      model,
      values,
      providerOptions: {
        google: {
          outputDimensionality: entry.outputDimensionality,
          taskType,
        },
      },
    });
    return embeddings;
  };
}
