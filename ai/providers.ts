import { groq } from "@ai-sdk/groq";
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";

const languageModels = {
  "Llama 4 Scout": groq("meta-llama/llama-4-scout-17b-16e-instruct"),
  "Llama 3.3 Versatile": groq("llama-3.3-70b-versatile"),
  "Gemma 2 - Eng": groq("gemma2-9b-it"),
  "Deepseek R1": wrapLanguageModel({
    middleware: extractReasoningMiddleware({
      tagName: "think",
      startWithReasoning: true,
    }),
    model: groq("deepseek-r1-distill-llama-70b"),
  }),
  Qwen: wrapLanguageModel({
    middleware: extractReasoningMiddleware({
      tagName: "think",
      startWithReasoning: true,
    }),
    model: groq("qwen-qwq-32b"),
  }),
};

export const model = customProvider({
  languageModels,
});

export type modelID = keyof typeof languageModels;

export const MODELS = Object.keys(languageModels);

export const defaultModel: modelID = "Llama 4 Scout";

export const modelCapabilities: Record<
  modelID,
  { img: boolean; pdf: boolean }
> = {
  "Llama 4 Scout": { img: true, pdf: false },
  "Llama 3.3 Versatile": { img: false, pdf: false },
  "Gemma 2 - Eng": { img: false, pdf: false },
  "Deepseek R1": { img: false, pdf: false },
  Qwen: { img: false, pdf: false },
};
