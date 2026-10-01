import type { ModelConfiguration } from "inference";
import type {
  TextClassifications,
  TranslationClassifications,
} from "./policy";

// Ports expose the classifier and one model configuration per workflow.
// Classification is a Decisions-API call (not a Model Configuration), so it
// arrives already resolved — with its per-question fallbacks applied — as
// `TextClassifications`/`TranslationClassifications`. The factory owns
// streamObject/streamText and the prompt building.

export interface CorrectGrammarAiPort {
  classify(text: string): Promise<TextClassifications>;
  getGrammarModelConfiguration(): ModelConfiguration;
}

export interface TranslateAiPort {
  classify(text: string): Promise<TranslationClassifications>;
  getTranslateModelConfiguration(): ModelConfiguration;
}
