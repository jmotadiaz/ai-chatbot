import { groq } from "@ai-sdk/groq";
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createXai } from "@ai-sdk/xai";

export const xai = createXai();

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const languageModels = {
  "Llama 4 Scout": groq("meta-llama/llama-4-scout-17b-16e-instruct"),
  "Gemma 3": openrouter("google/gemma-3-27b-it"),
  "Deepseek R1": wrapLanguageModel({
    middleware: extractReasoningMiddleware({
      tagName: "think",
      startWithReasoning: true,
    }),
    model: groq("deepseek-r1-distill-llama-70b"),
  }),
  "Grok 3 Mini": xai("grok-3-mini"),
  Qwen3: openrouter.chat("qwen/qwen3-235b-a22b"),
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
  "Gemma 3": { img: true, pdf: false },
  "Grok 3 Mini": { img: true, pdf: false },
  "Deepseek R1": { img: false, pdf: false },
  Qwen3: { img: false, pdf: false },
};
