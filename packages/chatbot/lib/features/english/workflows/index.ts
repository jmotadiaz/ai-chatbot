import { makeCorrectGrammar, makeTranslate } from "./factory";
import { createEnglishClassifier } from "./classifier";
import type { CorrectGrammarAiPort, TranslateAiPort } from "./ports";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";

const classifier = createEnglishClassifier(inferenceKit.decide);

const grammarAiAdapter: CorrectGrammarAiPort = {
  classify: classifier.classifyForGrammar,
  getGrammarModelConfiguration: () =>
    inferenceKit.languageModel("englishGrammarCheck"),
};

const translateAiAdapter: TranslateAiPort = {
  classify: classifier.classifyForTranslation,
  getTranslateModelConfiguration: () =>
    inferenceKit.languageModel("englishTranslate"),
};

export const correctGrammar = makeCorrectGrammar(grammarAiAdapter);
export const translate = makeTranslate(translateAiAdapter);
