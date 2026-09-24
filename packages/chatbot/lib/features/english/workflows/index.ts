import { makeCorrectGrammar, makeTranslate } from "./factory";
import type { CorrectGrammarAiPort, TranslateAiPort } from "./ports";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";

const grammarAiAdapter: CorrectGrammarAiPort = {
  getAudienceModelConfiguration: () =>
    inferenceKit.languageModel("englishAudienceClassifier"),
  getDomainModelConfiguration: () =>
    inferenceKit.languageModel("englishDomainClassifier"),
  getGrammarModelConfiguration: () =>
    inferenceKit.languageModel("englishGrammarCheck"),
};

const translateAiAdapter: TranslateAiPort = {
  getAudienceModelConfiguration: () =>
    inferenceKit.languageModel("englishAudienceClassifier"),
  getDomainModelConfiguration: () =>
    inferenceKit.languageModel("englishDomainClassifier"),
  getDirectionModelConfiguration: () =>
    inferenceKit.languageModel("englishDirectionDetector"),
  getTranslateModelConfiguration: () =>
    inferenceKit.languageModel("englishTranslate"),
};

export const correctGrammar = makeCorrectGrammar(grammarAiAdapter);
export const translate = makeTranslate(translateAiAdapter);
