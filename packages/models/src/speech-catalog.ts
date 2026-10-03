/**
 * Speech is a different endpoint kind from `ProviderKind` (language models):
 * it gets its own small catalog and role map, mirroring the pattern used for
 * embedding/rerank/decision operations (see `09-orchestrator-decisions.md`).
 * Today `lib/features/english/actions.ts` is the only speech call site in the
 * chatbot — it called `openai.speech("gpt-4o-mini-tts-2025-03-20")` directly,
 * bypassing the catalog entirely. Voice, speed and instructions are call
 * parameters, not part of the model, so they stay in the feature.
 */
export type SpeechProviderKind = "openai";

export interface SpeechModelCatalogEntry {
  id: string;
  provider: { kind: SpeechProviderKind; modelId: string };
}

export const SPEECH_MODELS = [
  {
    id: "GPT-4o Mini TTS",
    provider: { kind: "openai", modelId: "gpt-4o-mini-tts-2025-03-20" },
  },
] as const satisfies readonly SpeechModelCatalogEntry[];

export type SpeechModelId = (typeof SPEECH_MODELS)[number]["id"];

/** Model Roles for speech, resolved the same way `LANGUAGE_MODEL_ROLES` is. */
export const SPEECH_ROLES = {
  /** `lib/features/english/actions.ts`'s `generateSpeech`. */
  englishTts: "GPT-4o Mini TTS",
} as const satisfies Record<string, SpeechModelId>;

export type SpeechRole = keyof typeof SPEECH_ROLES;
