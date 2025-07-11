import { groq } from "@ai-sdk/groq";
import { JSONValue, LanguageModelV1 } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createXai } from "@ai-sdk/xai";
import { createOpenAI } from "@ai-sdk/openai";
import {
  createGoogleGenerativeAI,
  GoogleGenerativeAIProviderOptions,
} from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import { defaultSystemPrompt } from "@/lib/ai/prompts";

export const google = createGoogleGenerativeAI();
export const openai = createOpenAI({
  compatibility: "strict",
});
export const xai = createXai();
export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export interface ModelConfiguration {
  model: LanguageModelV1;
  providerOptions?: Record<string, Record<string, JSONValue>>;
  temperature?: number;
  topP?: number;
  topK?: number;
  systemPrompt?: string;
}

export type ModelConfigurations = Record<string, ModelConfiguration>;

export const languageModelConfigurations = {
  "Llama 3.1 Instant": {
    model: groq("llama-3.1-8b-instant"),
  },
  "Llama 3.3 Versatile": {
    model: groq("llama-3.3-70b-versatile"),
    temperature: 0.6,
    topP: 0.9,
  },
  "Llama 4 Maverick": {
    model: groq("meta-llama/llama-4-maverick-17b-128e-instruct"),
    temperature: 0.6,
    topP: 0.9,
  },
  "Deepseek V3": {
    model: openrouter.chat("deepseek/deepseek-chat-v3-0324"),
    temperature: 0.3,
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
  "GPT 4.1": {
    model: openai("gpt-4.1"),
  },
  "Gemma 2": {
    model: groq("gemma2-9b-it"),
  },
  "Gemma 3": {
    model: openrouter("google/gemma-3-27b-it"),
  },
  "Gemini 2.0 Flash": {
    model: google("gemini-2.0-flash"),
  },
  "Gemini 2.5 Flash Lite": {
    model: google("gemini-2.5-flash-lite-preview-06-17"),
  },
  "Gemini 2.5 Flash No Think": {
    model: google("gemini-2.5-flash"),
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingBudget: 0,
        },
      } as GoogleGenerativeAIProviderOptions,
    },
  },
  "Gemini 2.5 Flash": {
    model: google("gemini-2.5-flash"),
  },
  "Deepseek R1 Distill": {
    model: groq("deepseek-r1-distill-llama-70b"),
    temperature: 0.6,
    topP: 0.95,
    providerOptions: {
      groq: { reasoningFormat: "parsed" },
    },
  },
  "Deepseek R1 0528": {
    model: openrouter.chat("deepseek/deepseek-r1-0528"),
    temperature: 0.6,
    topP: 0.95,
  },
  "Qwen 3": {
    model: groq("qwen/qwen3-32b"),
    temperature: 0.6,
    topP: 0.95,
    topK: 20,
    providerOptions: {
      groq: { reasoningFormat: "parsed" },
    },
  },
  "Claude Sonnet 4": {
    model: anthropic("claude-sonnet-4-20250514"),
  },
  "Claude Opus 4": {
    model: anthropic("claude-opus-4-20250514"),
  },
  "o4 Mini": {
    model: openai("o4-mini"),
  },
  o3: {
    model: openai("o3"),
  },
  "Gemini 2.5 Pro": {
    model: google("gemini-2.5-pro"),
  },
  "Grok 3 Mini": {
    model: xai("grok-3-mini"),
  },
  "Grok 4": {
    model: xai("grok-4-0709"),
  },
} satisfies ModelConfigurations;

const pickModelConfigurations = <
  T extends keyof typeof languageModelConfigurations
>(
  modelKeys: T[]
): Record<T, ModelConfiguration> => {
  const models: Record<T, ModelConfiguration> = {} as Record<
    T,
    ModelConfiguration
  >;
  modelKeys.forEach((key) => {
    if (languageModelConfigurations[key]) {
      models[key] = languageModelConfigurations[key];
    }
  });
  return models;
};

const chatModelKeys = [
  "Llama 4 Maverick",
  "Deepseek V3",
  "Gemini 2.5 Flash",
  "GPT 4.1 Mini",
  "GPT 4.1",
  "Qwen 3",
  "Deepseek R1 0528",
  "Gemini 2.5 Pro",
  "Claude Sonnet 4",
  "o4 Mini",
  "o3",
  "Grok 3 Mini",
  "Grok 4",
] satisfies (keyof typeof languageModelConfigurations)[];

export const chatModelConfigurations = pickModelConfigurations(chatModelKeys);

export type chatModelId =
  | (typeof chatModelKeys)[number]
  | "Auto Model Workflow";

export const CHAT_MODELS: chatModelId[] = [
  "Auto Model Workflow",
  ...chatModelKeys,
];

export const defaultModel: chatModelId = "Auto Model Workflow";
export const defaultTemperature = 0.3;
export const defaultTopP = 0.95;
export const defaultTopK = 40;

export const getChatConfigurationByModelId = (
  modelId: chatModelId
): Required<Omit<ModelConfiguration, "model" | "providerOptions">> => {
  const { temperature, topK, topP, systemPrompt } = Object.assign(
    {
      temperature: defaultTemperature,
      topP: defaultTopP,
      topK: defaultTopK,
      systemPrompt: defaultSystemPrompt,
    },
    modelId !== "Auto Model Workflow" ? chatModelConfigurations[modelId] : {}
  );

  return { temperature, topK, topP, systemPrompt };
};

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
