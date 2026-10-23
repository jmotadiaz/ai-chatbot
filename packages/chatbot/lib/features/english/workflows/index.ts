import { makeCorrectGrammar, makeTranslate } from "./factory";
import { createEnglishClassifier } from "./classifier";
import type { CorrectGrammarAiPort, TranslateAiPort } from "./ports";
import { warmModelCatalog } from "@/lib/infrastructure/ai/catalog";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";

const classifier = createEnglishClassifier(inferenceKit.decide);

const grammarAiAdapter: CorrectGrammarAiPort = {
  classify: classifier.classifyForGrammar,
  getGrammarModelConfiguration: () =>
    inferenceKit.languageModel("flash-default"),
};

const translateAiAdapter: TranslateAiPort = {
  classify: classifier.classifyForTranslation,
  getTranslateModelConfiguration: () =>
    inferenceKit.languageModel("flash-default"),
};

// `languageModel` is synchronous against the catalog snapshot: each workflow
// entry point warms it up before generating (the classify/decide above needs no
// catalog, but the generation does).
export const correctGrammar = async (prompt: string) => {
  await warmModelCatalog();
  return makeCorrectGrammar(grammarAiAdapter)(prompt);
};

export const translate = async (prompt: string) => {
  await warmModelCatalog();
  return makeTranslate(translateAiAdapter)(prompt);
};
