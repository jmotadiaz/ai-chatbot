import { makeCorrectGrammar, makeTranslate } from "./factory";
import type { CorrectGrammarAiPort, TranslateAiPort } from "./ports";
import { languageModelConfigurations } from "@/lib/features/foundation-model/config";

const grammarAiAdapter: CorrectGrammarAiPort = {
  getAudienceModelConfiguration: () =>
    languageModelConfigurations("GPT OSS Mini"),
  getDomainModelConfiguration: () =>
    languageModelConfigurations("GPT OSS Mini"),
  getGrammarModelConfiguration: () =>
    languageModelConfigurations("Gemini 3.1 Flash Lite"),
};

const translateAiAdapter: TranslateAiPort = {
  getAudienceModelConfiguration: () =>
    languageModelConfigurations("GPT OSS Mini"),
  getDomainModelConfiguration: () =>
    languageModelConfigurations("GPT OSS Mini"),
  getDirectionModelConfiguration: () =>
    languageModelConfigurations("GPT OSS Mini"),
  getTranslateModelConfiguration: () =>
    languageModelConfigurations("Gemini 3.1 Flash Lite"),
};

export const correctGrammar = makeCorrectGrammar(grammarAiAdapter);
export const translate = makeTranslate(translateAiAdapter);
