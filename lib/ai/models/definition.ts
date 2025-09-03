import { groq, GroqProviderOptions } from "@ai-sdk/groq";
import { LanguageModel } from "ai";
import { createXai, XaiProviderOptions } from "@ai-sdk/xai";
import { openai, OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import {
  createGoogleGenerativeAI,
  GoogleGenerativeAIProviderOptions,
} from "@ai-sdk/google";
import { anthropic, AnthropicProviderOptions } from "@ai-sdk/anthropic";
import { deepseek } from "@ai-sdk/deepseek";
import { perplexity } from "@ai-sdk/perplexity";
import {
  createOpenRouter,
  OpenRouterProviderOptions,
} from "@openrouter/ai-sdk-provider";
import { Tools } from "@/lib/ai/tools/types";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export const google = createGoogleGenerativeAI();
export const xai = createXai();
export type Company =
  | "meta"
  | "openai"
  | "anthropic"
  | "google"
  | "xai"
  | "deepseek"
  | "perplexity"
  | "alibaba"
  | "moonshotai"
  | "ai chatbot";

export interface ModelConfiguration {
  model: LanguageModel;
  providerOptions?: {
    anthropic?: AnthropicProviderOptions;
    groq?: GroqProviderOptions;
    google?: GoogleGenerativeAIProviderOptions;
    openai?: OpenAIResponsesProviderOptions;
    openrouter?: OpenRouterProviderOptions;
    xai?: XaiProviderOptions;
  };
  disabledConfig?: ("temperature" | "topP" | "topK")[];
  disabledTools?: Tools;
  supportedFiles?: Array<"pdf" | "img">;
  temperature?: number;
  topP?: number;
  topK?: number;
  company: Company;
  systemPrompt?: string;
}

export type ModelConfigurations = Record<string, ModelConfiguration>;

export const languageModelConfigurations = {
  "Llama 3.1 Instant": {
    model: groq("llama-3.1-8b-instant"),
    company: "meta",
    providerOptions: {
      groq: {
        structuredOutputs: false,
      },
    },
  },
  "Llama 3.3 Versatile": {
    model: groq("llama-3.3-70b-versatile"),
    company: "meta",
    temperature: 0.6,
    topP: 0.9,
  },
  "Llama 4 Scout": {
    model: groq("meta-llama/llama-4-scout-17b-16e-instruct"),
    company: "meta",
    temperature: 0.6,
    topP: 0.9,
  },
  "Llama 4": {
    model: groq("meta-llama/llama-4-maverick-17b-128e-instruct"),
    company: "meta",
    temperature: 0.6,
    topP: 0.9,
    supportedFiles: ["img"],
  },
  "Kimi K2": {
    model: groq("moonshotai/kimi-k2-instruct"),
    company: "moonshotai",
    temperature: 0.6,
  },
  "Deepseek Chat": {
    model: deepseek("deepseek-chat"),
    company: "deepseek",
    temperature: 0.6,
  },
  "Deepseek R1 Distill": {
    model: groq("deepseek-r1-distill-llama-70b"),
    company: "deepseek",
    temperature: 0.6,
    topP: 0.95,
    providerOptions: {
      groq: { reasoningFormat: "parsed" },
    },
  },
  "Deepseek R1": {
    model: openrouter.chat("deepseek/deepseek-r1-0528"),
    company: "deepseek",
    providerOptions: {
      openrouter: { reasoning: { enabled: true, effort: "high" } },
    },
    temperature: 0.3,
  },
  "Qwen 3": {
    model: groq("qwen/qwen3-32b"),
    company: "alibaba",
    temperature: 0.6,
    topP: 0.95,
    topK: 20,
    providerOptions: {
      groq: { reasoningFormat: "parsed" },
    },
  },
  "Qwen 3 Coder": {
    model: openrouter.chat("qwen/qwen3-coder"),
    company: "alibaba",
  },
  Sonar: {
    model: perplexity("sonar"),
    company: "perplexity",
    supportedFiles: ["img"],
    disabledTools: ["webSearch", "rag"],
  },
  "Sonar Pro": {
    model: perplexity("sonar-pro"),
    company: "perplexity",
    disabledTools: ["webSearch", "rag"],
  },
  "Sonar Reasoning": {
    model: perplexity("sonar-reasoning"),
    company: "perplexity",
    disabledTools: ["webSearch", "rag"],
  },
  "Claude 3.5 Haiku": {
    model: anthropic("claude-3-5-haiku-latest"),
    company: "anthropic",
  },
  "Claude Sonnet 4": {
    model: anthropic("claude-sonnet-4-20250514"),
    company: "anthropic",
    supportedFiles: ["img", "pdf"],
    providerOptions: {
      anthropic: {
        sendReasoning: true,
        thinking: { type: "enabled", budgetTokens: 10000 },
      },
    },
  },
  "Claude Opus 4.1": {
    model: anthropic("claude-opus-4-1-20250805"),
    company: "anthropic",
    supportedFiles: ["img", "pdf"],
    providerOptions: {
      anthropic: {
        sendReasoning: true,
        thinking: { type: "enabled", budgetTokens: 10000 },
      },
    },
  },
  "GPT OSS": {
    model: groq("openai/gpt-oss-120b"),
    company: "openai",
    providerOptions: {
      groq: { reasoningEffort: "high" },
    },
  },
  "GPT OSS Mini": {
    model: groq("openai/gpt-oss-20b"),
    company: "openai",
  },
  "o4 Mini": {
    model: openai("o4-mini"),
    company: "openai",
  },
  o3: {
    model: openai("o3"),
    company: "openai",
  },
  "GPT 5 Nano": {
    model: openai("gpt-5-nano-2025-08-07"),
    company: "openai",
    providerOptions: {
      openai: {
        textVerbosity: "low",
      },
    },
  },
  "GPT 5 Mini": {
    model: openai("gpt-5-mini-2025-08-07"),
    company: "openai",
    providerOptions: {
      openai: {
        textVerbosity: "low",
      },
    },
    supportedFiles: ["img", "pdf"],
  },
  "GPT 5": {
    model: openai("gpt-5-2025-08-07"),
    company: "openai",
    providerOptions: {
      openai: {
        textVerbosity: "low",
        reasoningEffort: "medium",
      },
    },
    supportedFiles: ["img", "pdf"],
  },
  "Gemini 2.0 Flash": {
    model: google("gemini-2.0-flash"),
    company: "google",
    supportedFiles: ["img", "pdf"],
  },
  "Gemini 2.5 Flash Lite": {
    model: google("gemini-2.5-flash-lite-preview-06-17"),
    company: "google",
    supportedFiles: ["img", "pdf"],
  },
  "Gemini 2.5 Flash": {
    model: google("gemini-2.5-flash"),
    company: "google",
    supportedFiles: ["img", "pdf"],
    providerOptions: {
      google: {
        thinkingConfig: {
          includeThoughts: true,
        },
      },
    },
  },
  "Gemini 2.5 Pro": {
    model: google("gemini-2.5-pro"),
    company: "google",
    supportedFiles: ["img", "pdf"],
    providerOptions: {
      google: {
        thinkingConfig: {
          includeThoughts: true,
        },
      },
    },
  },
  "Grok 3 Mini": {
    model: xai("grok-3-mini"),
    company: "xai",
  },
  "Grok 4": {
    model: xai("grok-4-0709"),
    company: "xai",
    supportedFiles: ["img", "pdf"],
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

export const chatModelKeys = [
  "Llama 4",
  "Kimi K2",
  "Deepseek Chat",
  "Qwen 3",
  "Qwen 3 Coder",
  "Deepseek R1",
  "Claude Sonnet 4",
  "Gemini 2.5 Flash",
  "Gemini 2.5 Pro",
  "GPT OSS Mini",
  "GPT OSS",
  "GPT 5 Mini",
  "GPT 5",
  "o3",
  "Grok 3 Mini",
  "Grok 4",
] satisfies (keyof typeof languageModelConfigurations)[];

export const chatModelConfigurations = pickModelConfigurations(chatModelKeys);

export type chatModelId = (typeof chatModelKeys)[number] | "Router";

export const CHAT_MODELS: chatModelId[] = ["Router", ...chatModelKeys];

export const defaultModel: chatModelId = "Router";
export const defaultTemperature = 0.3;
export const defaultTopP = 0.95;
export const defaultTopK = 40;
