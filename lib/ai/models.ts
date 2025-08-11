import { groq, GroqProviderOptions } from "@ai-sdk/groq";
import { LanguageModel } from "ai";
import { createXai } from "@ai-sdk/xai";
import { openai, OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import {
  createGoogleGenerativeAI,
  GoogleGenerativeAIProviderOptions,
} from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import { perplexity } from "@ai-sdk/perplexity";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { defaultSystemPrompt } from "@/lib/ai/prompts";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export const google = createGoogleGenerativeAI();
export const xai = createXai();

export interface ModelConfiguration {
  model: LanguageModel;
  providerOptions?: {
    groq?: GroqProviderOptions;
    google?: GoogleGenerativeAIProviderOptions;
    openai?: OpenAIResponsesProviderOptions;
  };
  temperature?: number;
  topP?: number;
  topK?: number;
  systemPrompt?: string;
}

export type ModelConfigurations = Record<string, ModelConfiguration>;

export const languageModelConfigurations = {
  "Llama 3.1 Instant": {
    model: groq("llama-3.1-8b-instant"),
    providerOptions: {
      groq: {
        structuredOutputs: false,
      },
    },
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
  "Kimi K2": {
    model: groq("moonshotai/kimi-k2-instruct"),
    temperature: 0.6,
  },
  "Deepseek Chat": {
    model: openrouter.chat("deepseek/deepseek-chat-v3-0324"),
    temperature: 0.6,
  },
  "Claude 3.5 Haiku": {
    model: anthropic("claude-3-5-haiku-latest"),
  },
  "GPT 5 Nano": {
    model: openai("gpt-5-nano-2025-08-07"),
    temperature: undefined,
    topP: undefined,
    topK: undefined,
  },
  "GPT 5 Mini": {
    model: openai("gpt-5-mini-2025-08-07"),
    temperature: undefined,
    topP: undefined,
    topK: undefined,
  },
  "GPT 5": {
    model: openai("gpt-5-2025-08-07"),
    providerOptions: {
      openai: {
        reasoningEffort: "medium",
      },
    },
    temperature: undefined,
    topP: undefined,
    topK: undefined,
  },
  "Gemma 2": {
    model: groq("gemma2-9b-it"),
  },
  "Gemini 2.0 Flash": {
    model: google("gemini-2.0-flash"),
  },
  "Gemini 2.5 Flash Lite": {
    model: google("gemini-2.5-flash-lite-preview-06-17"),
  },
  "Gemini 2.5 Flash Lite Web Search": {
    model: google("gemini-2.5-flash-lite-preview-06-17"),
    providerOptions: {
      google: {},
    },
  },
  "Gemini 2.5 Flash": {
    model: google("gemini-2.5-flash"),
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    },
  },
  "Gemini 2.5 Flash Thinking": {
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
  "Deepseek R1": {
    model: openrouter.chat("deepseek/deepseek-r1-0528", {
      reasoning: { enabled: true, effort: "medium" },
    }),
    temperature: 0.3,
  },
  Sonar: {
    model: perplexity("sonar"),
  },
  "Sonar Pro": {
    model: perplexity("sonar-pro"),
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
  "GPT OSS": {
    model: groq("openai/gpt-oss-120b"),
    temperature: 0.6,
    topP: 0.95,
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
  "Kimi K2",
  "Llama 4 Maverick",
  "Deepseek Chat",
  "Gemini 2.5 Flash",
  "GPT 5 Mini",
  "Sonar",
  "Qwen 3",
  "Deepseek R1",
  "Claude Sonnet 4",
  "Gemini 2.5 Pro",
  "GPT OSS",
  "GPT 5",
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

export const defaultModel: chatModelId = "Kimi K2";
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
