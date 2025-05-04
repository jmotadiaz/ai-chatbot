import { groq } from "@ai-sdk/groq";
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";

const languageModels = {
  "Llama 4 Scout": groq("meta-llama/llama-4-scout-17b-16e-instruct"),
  "Llama 3.3 Versatile": groq("llama-3.3-70b-versatile"),
  "Deepseek R1": wrapLanguageModel({
    middleware: extractReasoningMiddleware({
      tagName: "think",
    }),
    model: groq("deepseek-r1-distill-llama-70b"),
  }),
};

export const model = customProvider({
  languageModels,
});

export type modelID = keyof typeof languageModels;

export const MODELS = Object.keys(languageModels);

export const defaultModel: modelID =
  "meta-llama/llama-4-scout-17b-16e-instruct";
