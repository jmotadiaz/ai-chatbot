import { groq } from "@ai-sdk/groq";
import {
  extractReasoningMiddleware,
  JSONValue,
  LanguageModelV1,
  wrapLanguageModel,
} from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createXai } from "@ai-sdk/xai";
import { createOpenAI } from "@ai-sdk/openai";
import {
  createGoogleGenerativeAI,
  GoogleGenerativeAIProviderOptions,
} from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";

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

export interface ModelConfiguration {
  model: LanguageModelV1;
  providerOptions?: Record<string, Record<string, JSONValue>>;
}

export type ModelConfigurations = Record<string, ModelConfiguration>;

const modelConfigurationFactory =
  <T extends ModelConfigurations>(languageModels: T) =>
  (modelName: keyof T | "Auto"): ModelConfiguration => {
    return languageModels[modelName] ?? languageModels["Llama 4 Maverick"];
  };

const languageModels = {
  "Llama 3.1 Instant": {
    model: groq("llama-3.1-8b-instant"),
  },
  "Llama 4 Maverick": {
    model: groq("meta-llama/llama-4-maverick-17b-128e-instruct"),
  },
  "Deepseek V3": {
    model: openrouter.chat("deepseek/deepseek-chat-v3-0324"),
  },
  "Mistral 3 Medium": {
    model: openrouter.chat("mistralai/mistral-medium-3"),
  },
  "Claude 3.5 Haiku": {
    model: anthropic("claude-3-5-haiku-latest"),
  },
  "GPT 4.1 Mini": {
    model: openai("gpt-4.1-mini"),
  },
  "Gemini 2.5 Flash": {
    model: google("gemini-2.5-flash-preview-05-20"),
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingBudget: 0,
        },
      } satisfies GoogleGenerativeAIProviderOptions,
    },
  },
  "Deepseek R1 Distill": {
    model: wrapLanguageModel({
      middleware: extractReasoningMiddleware({
        tagName: "think",
        startWithReasoning: true,
      }),
      model: groq("deepseek-r1-distill-llama-70b"),
    }),
  },
  "Deepseek R1 0528": {
    model: openrouter.chat("deepseek/deepseek-r1-0528"),
  },
  "Qwen 3": {
    model: openrouter.chat("qwen/qwen3-30b-a3b"),
    providerOptions: {
      reasoning: {
        effort: "low",
      },
    },
  },
  "Claude Sonnet 4": {
    model: anthropic("claude-sonnet-4-20250514"),
  },
  "o4 Mini": {
    model: openai("o4-mini"),
  },
  o3: {
    model: openai("o3"),
  },
  "Gemini 2.5 Pro": {
    model: google("gemini-2.5-pro-preview-05-06"),
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingBudget: 2048,
        },
      } satisfies GoogleGenerativeAIProviderOptions,
    },
  },
  "Grok 3 Mini": {
    model: xai("grok-3-mini"),
  },
  "Grok 3": {
    model: xai("grok-3"),
  },
} satisfies ModelConfigurations;

export const refinePromptModel = openai("o3");
export const titleModel = groq("llama-3.1-8b-instant");

export const getModelConfiguration = modelConfigurationFactory(languageModels);

export type modelID = keyof typeof languageModels | "Auto";

export const MODELS = ["Auto", ...Object.keys(languageModels)] as modelID[];

export const defaultModel = "Auto";
export const defaultTemperature = 0.3;
export const defaultTopP = 0.95;

// export const modelCapabilities: Record<
//   modelID,
//   { img: boolean; pdf: boolean }
// > = {
//   "Llama 4 Maverick": { img: false, pdf: false },
//   "Mistral 3 Medium": { img: false, pdf: false },
//   "Deepseek V3": { img: false, pdf: false },
//   "Claude 3.5 Haiku": { img: false, pdf: false },
//   "GPT 4.1 Mini": { img: false, pdf: false },
//   "Gemini 2.5 Flash": { img: false, pdf: false },
//   "Claude Sonnet 4": { img: false, pdf: false },
//   "Deepseek R1 Distill": { img: false, pdf: false },
//   "Deepseek R1 0528": { img: false, pdf: false },
//   "Qwen 3": { img: false, pdf: false },
//   "o4 Mini": { img: false, pdf: false },
//   "Gemini 2.5 Pro": { img: false, pdf: false },
//   "Grok 3 Mini": { img: false, pdf: false },
//   "Grok 3": { img: false, pdf: false },
// };
