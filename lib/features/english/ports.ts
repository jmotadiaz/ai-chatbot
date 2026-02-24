import type { ModelConfiguration } from "@/lib/features/foundation-model/types";

// Ports expose only model configuration providers — one per classifier/action.
// The factory owns generateObject, streamObject, streamText.

export interface CorrectGrammarAiPort {
  getAudienceModelConfiguration(): ModelConfiguration;
  getDomainModelConfiguration(): ModelConfiguration;
  getGrammarModelConfiguration(): ModelConfiguration;
}

export interface TranslateAiPort {
  getAudienceModelConfiguration(): ModelConfiguration;
  getDomainModelConfiguration(): ModelConfiguration;
  getDirectionModelConfiguration(): ModelConfiguration;
  getTranslateModelConfiguration(): ModelConfiguration;
}
