import { groq } from "@ai-sdk/groq";
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createXai } from "@ai-sdk/xai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

const google = createGoogleGenerativeAI({
  // custom settings
});

const openai = createOpenAI({
  compatibility: "strict",
});

export const xai = createXai();

export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const languageModels = {
  "Llama 4 Maverick": groq("meta-llama/llama-4-maverick-17b-128e-instruct"),
  "Deepseek V3": openrouter.chat("deepseek/deepseek-chat-v3-0324"),
  "Mistral 3 Medium": openrouter.chat("mistralai/mistral-medium-3"),
  "GPT 4.1 Mini": openai("gpt-4.1-mini"),
  "Gemini 2.5 Flash": google("gemini-2.5-flash-preview-05-20"),
  "Deepseek R1 Distill": wrapLanguageModel({
    middleware: extractReasoningMiddleware({
      tagName: "think",
      startWithReasoning: true,
    }),
    model: groq("deepseek-r1-distill-llama-70b"),
  }),
  "Qwen 3": openrouter.chat("qwen/qwen3-30b-a3b", {
    reasoning: {
      effort: "low",
    },
  }),
  "o4 Mini": openai("o4-mini"),
  "Gemini 2.5 Pro": google("gemini-2.5-pro-preview-05-06"),
  "Grok 3 Mini": xai("grok-3-mini"),
  "Grok 3": xai("grok-3"),
};

export const refinePromptModel = google("gemini-2.5-pro-preview-05-06");
export const titleModel = groq("llama-3.1-8b-instant");

export const model = customProvider({
  languageModels,
});

export type modelID = keyof typeof languageModels;

export const MODELS = Object.keys(languageModels);

export const defaultModel: modelID = "Llama 4 Maverick";
export const defaultTemperature = 0.2;
export const defaultTopP = 0.95;

export const modelCapabilities: Record<
  modelID,
  { img: boolean; pdf: boolean }
> = {
  "Llama 4 Maverick": { img: false, pdf: false },
  "Mistral 3 Medium": { img: false, pdf: false },
  "Deepseek V3": { img: false, pdf: false },
  "GPT 4.1 Mini": { img: false, pdf: false },
  "Gemini 2.5 Flash": { img: false, pdf: false },
  "Deepseek R1 Distill": { img: false, pdf: false },
  "Qwen 3": { img: false, pdf: false },
  "o4 Mini": { img: false, pdf: false },
  "Gemini 2.5 Pro": { img: false, pdf: false },
  "Grok 3 Mini": { img: false, pdf: false },
  "Grok 3": { img: false, pdf: false },
};
