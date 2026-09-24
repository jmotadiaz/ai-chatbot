import { makeCorrectGrammar, makeTranslate } from "./factory";
import type { CorrectGrammarAiPort, TranslateAiPort } from "./ports";
import { languageModelConfigurations } from "@/lib/features/foundation-model/server";

const grammarAiAdapter: CorrectGrammarAiPort = {
  getAudienceModelConfiguration: () =>
    languageModelConfigurations("englishAudienceClassifier"),
  getDomainModelConfiguration: () =>
    languageModelConfigurations("englishDomainClassifier"),
  getGrammarModelConfiguration: () =>
    languageModelConfigurations("englishGrammarCheck"),
};

const translateAiAdapter: TranslateAiPort = {
  getAudienceModelConfiguration: () =>
    languageModelConfigurations("englishAudienceClassifier"),
  getDomainModelConfiguration: () =>
    languageModelConfigurations("englishDomainClassifier"),
  getDirectionModelConfiguration: () =>
    languageModelConfigurations("englishDirectionDetector"),
  getTranslateModelConfiguration: () =>
    languageModelConfigurations("englishTranslate"),
};

export const correctGrammar = makeCorrectGrammar(grammarAiAdapter);
export const translate = makeTranslate(translateAiAdapter);
