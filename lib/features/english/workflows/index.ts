import { makeCorrectGrammar, makeTranslate } from "./factory";
import type { CorrectGrammarAiPort, TranslateAiPort } from "./ports";
import { languageModelConfigurations } from "@/lib/features/foundation-model/config";

const grammarAiAdapter: CorrectGrammarAiPort = {
  getAudienceModelConfiguration: () =>
    languageModelConfigurations("Llama 3.1 Instant"),
  getDomainModelConfiguration: () =>
    languageModelConfigurations("Llama 3.1 Instant"),
  getGrammarModelConfiguration: () =>
    languageModelConfigurations("Gemini 2.5 Flash"),
};

const translateAiAdapter: TranslateAiPort = {
  getAudienceModelConfiguration: () =>
    languageModelConfigurations("Llama 3.1 Instant"),
  getDomainModelConfiguration: () =>
    languageModelConfigurations("Llama 3.1 Instant"),
  getDirectionModelConfiguration: () =>
    languageModelConfigurations("GPT OSS Mini"),
  getTranslateModelConfiguration: () =>
    languageModelConfigurations("Gemini 2.5 Flash"),
};

export const correctGrammar = makeCorrectGrammar(grammarAiAdapter);
export const translate = makeTranslate(translateAiAdapter);
