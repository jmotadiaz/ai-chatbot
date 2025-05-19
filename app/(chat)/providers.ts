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
  "Llama 4 Maverick": groq("meta-llama/llama-4-maverick-17b-128e-instruct"),
  "Deepseek v3 Chat": openrouter("deepseek/deepseek-chat-v3-0324:free"),
  "Deepseek R1": wrapLanguageModel({
    middleware: extractReasoningMiddleware({
      tagName: "think",
      startWithReasoning: true,
    }),
    model: groq("deepseek-r1-distill-llama-70b"),
  }),
  "Grok 3 Mini": xai("grok-3-mini"),
  Qwen3: openrouter.chat("qwen/qwen3-235b-a22b:free"),
};

export const model = customProvider({
  languageModels,
});

export type modelID = keyof typeof languageModels;

export const MODELS = Object.keys(languageModels);

export const defaultModel: modelID = "Llama 4 Maverick";

export const modelCapabilities: Record<
  modelID,
  { img: boolean; pdf: boolean }
> = {
  "Llama 4 Maverick": { img: true, pdf: false },
  "Deepseek v3 Chat": { img: true, pdf: false },
  "Grok 3 Mini": { img: true, pdf: false },
  "Deepseek R1": { img: false, pdf: false },
  Qwen3: { img: false, pdf: false },
};
