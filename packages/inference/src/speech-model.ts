import type { SpeechModelV3 } from "@ai-sdk/provider";
import {
  SPEECH_MODELS,
  SPEECH_ROLES,
  resolveCatalogEntry,
  type SpeechModelCatalogEntry,
  type SpeechModelId,
  type SpeechRole,
} from "models";
import type { SpeechClients, SpeechModelKey } from "./types";

const catalogById = new Map<SpeechModelId, SpeechModelCatalogEntry>(
  SPEECH_MODELS.map((entry) => [entry.id as SpeechModelId, entry]),
);

function resolveSpeechEntry(key: SpeechModelKey) {
  return resolveCatalogEntry<SpeechModelId, SpeechModelCatalogEntry, SpeechRole>(
    catalogById,
    key,
    { kind: "Speech model", catalogName: "SPEECH_MODELS" },
    SPEECH_ROLES,
  );
}

/**
 * Builds `speechModel(idOrRole)`: resolves a `SPEECH_MODELS` id or a
 * `SPEECH_ROLES` role to its constructed `SpeechModelV3`, memoized on this
 * kit instance by resolved id. Unlike `languageModel` there is no expandable
 * configuration here — voice, speed and instructions are call-time
 * parameters the feature passes to `experimental_generateSpeech` directly,
 * not part of the catalog entry.
 */
export function createSpeechModelResolver(
  clients: SpeechClients,
): (key: SpeechModelKey) => SpeechModelV3 {
  const cache = new Map<SpeechModelId, SpeechModelV3>();

  return (key) => {
    const { id, entry } = resolveSpeechEntry(key);
    let model = cache.get(id);
    if (!model) {
      model = clients[entry.provider.kind](entry.provider.modelId);
      cache.set(id, model);
    }
    return model;
  };
}
