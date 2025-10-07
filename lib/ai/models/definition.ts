import { groq, GroqProviderOptions } from "@ai-sdk/groq";
import {
  extractReasoningMiddleware,
  LanguageModel,
  wrapLanguageModel,
} from "ai";
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
  | "mistral"
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
  toolCalling?: boolean;
  reasoning?: boolean;
  supportedFiles?: Array<"pdf" | "img">;
  supportedOutput?: Array<"text" | "img">;
  temperature?: number;
  topP?: number;
  topK?: number;
  company: Company;
  systemPrompt?: string;
}

const reasoningMw = extractReasoningMiddleware({
  tagName: "think",
  separator: "\n",
  startWithReasoning: false,
});

export const LANGUAGE_MODEL_CONFIGURATIONS_CONST = {
  "Llama 3.1 Instant": {
    model: groq("llama-3.1-8b-instant"),
    company: "meta",
    providerOptions: {
      groq: {
        structuredOutputs: false,
      },
    },
  },
  "Llama 3.3": {
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
    supportedFiles: ["img"],
  },
  "Llama 4 Maverick": {
    model: groq("meta-llama/llama-4-maverick-17b-128e-instruct"),
    company: "meta",
    temperature: 0.6,
    topP: 0.9,
    supportedFiles: ["img"],
  },
  "Kimi K2": {
    model: groq("moonshotai/kimi-k2-instruct-0905"),
    company: "moonshotai",
    temperature: 0.6,
  },
  "Magistral Medium": {
    model: openrouter.chat("mistralai/magistral-medium-2506:thinking"),
    company: "mistral",
    providerOptions: {
      openrouter: { reasoning: { enabled: true, effort: "high" } },
    },
  },
  "Magistral Small": {
    model: openrouter.chat("mistralai/magistral-small-2506"),
    company: "mistral",
  },
  "Deepseek Chat": {
    model: deepseek("deepseek-chat"),
    company: "deepseek",
    temperature: 0.6,
  },
  "Deepseek R1": {
    model: wrapLanguageModel({
      model: openrouter.chat("deepseek/deepseek-r1-0528"),
      middleware: [reasoningMw],
    }),
    company: "deepseek",
    reasoning: true,
    providerOptions: {
      openrouter: { reasoning: { enabled: true, effort: "high" } },
    },
    temperature: 0.3,
  },
  "Qwen3 Next Instruct": {
    model: openrouter.chat("qwen/qwen3-next-80b-a3b-instruct"),
    company: "alibaba",
    temperature: 0.7,
    topP: 0.8,
    topK: 20,
  },
  "Qwen3 Next Thinking": {
    model: wrapLanguageModel({
      model: openrouter.chat("qwen/qwen3-next-80b-a3b-thinking"),
      middleware: [reasoningMw],
    }),
    reasoning: true,
    providerOptions: {
      openrouter: { reasoning: { enabled: true, effort: "high" } },
    },
    company: "alibaba",
    temperature: 0.6,
    topP: 0.95,
    topK: 20,
  },
  "Qwen3 Coder": {
    model: openrouter.chat("qwen/qwen3-coder"),
    company: "alibaba",
  },
  Sonar: {
    model: perplexity("sonar"),
    company: "perplexity",
    supportedFiles: ["img"],
    toolCalling: false,
  },
  "Sonar Pro": {
    model: perplexity("sonar-pro"),
    company: "perplexity",
    supportedFiles: ["img"],
    toolCalling: false,
  },
  "Sonar Reasoning": {
    model: wrapLanguageModel({
      model: perplexity("sonar-pro"),
      middleware: [reasoningMw],
    }),
    reasoning: true,
    company: "perplexity",
    supportedFiles: ["img"],
    toolCalling: false,
  },
  "Claude Haiku 3.5": {
    model: anthropic("claude-3-5-haiku-latest"),
    company: "anthropic",
    supportedFiles: ["img", "pdf"],
  },
  "Claude Sonnet 4.5": {
    model: anthropic("claude-sonnet-4-5-20250929"),
    company: "anthropic",
    supportedFiles: ["img", "pdf"],
    disabledConfig: ["topP", "topK"],
    reasoning: true,
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
    reasoning: true,
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
    reasoning: true,
    providerOptions: {
      groq: { reasoningEffort: "high" },
    },
  },
  "GPT OSS Mini": {
    model: groq("openai/gpt-oss-20b"),
    reasoning: true,
    company: "openai",
  },
  "o4 Mini": {
    model: openai("o4-mini"),
    reasoning: true,
    company: "openai",
  },
  o3: {
    model: openai("o3"),
    reasoning: true,
    company: "openai",
  },
  "GPT 5 Nano": {
    model: openai("gpt-5-nano-2025-08-07"),
    company: "openai",
    providerOptions: {
      openai: {
        textVerbosity: "low",
        serviceTier: "priority",
      },
    },
  },
  "GPT 5 Mini": {
    model: openai("gpt-5-mini-2025-08-07"),
    reasoning: true,
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
    reasoning: true,
    company: "openai",
    providerOptions: {
      openai: {
        textVerbosity: "low",
        reasoningEffort: "high",
        serviceTier: "priority",
      },
    },
    supportedFiles: ["img", "pdf"],
  },
  "Gemini 2.0 Flash": {
    model: "google/gemini-2.0-flash",
    company: "google",
    supportedFiles: ["img", "pdf"],
  },
  "Gemini 2.5 Flash Lite": {
    model: "google/gemini-2.5-flash-lite",
    company: "google",
    supportedFiles: ["img", "pdf"],
  },
  "Gemini 2.5 Flash": {
    model: "google/gemini-2.5-flash",
    company: "google",
    supportedFiles: ["img", "pdf"],
    reasoning: true,
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingBudget: 1024,
          includeThoughts: true,
        },
      },
    },
  },
  "Gemini 2.5 Pro": {
    model: "google/gemini-2.5-pro",
    company: "google",
    supportedFiles: ["img", "pdf"],
    reasoning: true,
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingBudget: 1024,
          includeThoughts: true,
        },
      },
    },
  },
  "Gemini Nano Banana": {
    model: "google/gemini-2.5-flash-image-preview",
    company: "google",
    supportedFiles: ["img", "pdf"],
    supportedOutput: ["text", "img"],
    providerOptions: {
      google: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    },
  },
  "Grok Code Fast": {
    model: xai("grok-code-fast-1"),
    company: "xai",
  },
  "Grok 4 Fast": {
    model: xai("grok-4-fast"),
    company: "xai",
    supportedFiles: ["img"],
    reasoning: true,
  },
  "Grok 4": {
    model: xai("grok-4-0709"),
    company: "xai",
    supportedFiles: ["img"],
    reasoning: true,
  },
} as const satisfies Record<string, ModelConfiguration>;

export type LanguageModelKeys =
  keyof typeof LANGUAGE_MODEL_CONFIGURATIONS_CONST;

export type ModelConfigurations = {
  [K in LanguageModelKeys]: ModelConfiguration;
};

export const languageModelConfigurations: ModelConfigurations =
  LANGUAGE_MODEL_CONFIGURATIONS_CONST;

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
  "Llama 4 Scout",
  "Llama 4 Maverick",
  "Kimi K2",
  "Qwen3 Coder",
  "Qwen3 Next Instruct",
  "Qwen3 Next Thinking",
  "Deepseek Chat",
  "Deepseek R1",
  "Sonar",
  "Sonar Pro",
  "Claude Sonnet 4.5",
  "Claude Opus 4.1",
  "Grok Code Fast",
  "Grok 4 Fast",
  "Grok 4",
  "GPT OSS Mini",
  "GPT OSS",
  "GPT 5 Mini",
  "GPT 5",
  "Gemini 2.5 Flash Lite",
  "Gemini 2.5 Flash",
  "Gemini Nano Banana",
  "Gemini 2.5 Pro",
] satisfies LanguageModelKeys[];

export const chatModelConfigurations = pickModelConfigurations(chatModelKeys);

export type chatModelId = (typeof chatModelKeys)[number] | "Router";

export const CHAT_MODELS: chatModelId[] = ["Router", ...chatModelKeys];

export const defaultModel: chatModelId = "Router";
export const defaultTemperature = 0.3;
export const defaultTopP = 0.95;
export const defaultTopK = 40;
