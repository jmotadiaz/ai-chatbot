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
import {
  RAG_TOOL,
  Tools,
  URL_CONTEXT_TOOL,
  WEB_SEARCH_TOOL,
} from "@/lib/ai/tools/types";

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
  supportedOutput?: Array<"text" | "img">;
  temperature?: number;
  topP?: number;
  topK?: number;
  company: Company;
  systemPrompt?: string;
}

const reasoningMw = extractReasoningMiddleware({
  tagName: "think", // <think>... </think>
  separator: "\n",
  startWithReasoning: false, // cambiar a true si el modelo no la incluye al inicio
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
  "Llama 4": {
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
    model: deepseek("deepseek-reasoner"),
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
    disabledTools: [WEB_SEARCH_TOOL, RAG_TOOL, URL_CONTEXT_TOOL],
  },
  "Sonar Pro": {
    model: perplexity("sonar-pro"),
    company: "perplexity",
    supportedFiles: ["img"],
    disabledTools: [WEB_SEARCH_TOOL, RAG_TOOL, URL_CONTEXT_TOOL],
  },
  "Sonar Reasoning": {
    model: wrapLanguageModel({
      model: perplexity("sonar-pro"),
      middleware: [reasoningMw],
    }),
    company: "perplexity",
    supportedFiles: ["img"],
    disabledTools: [WEB_SEARCH_TOOL, RAG_TOOL, URL_CONTEXT_TOOL],
  },
  "Claude Haiku 3.5": {
    model: anthropic("claude-3-5-haiku-latest"),
    company: "anthropic",
    supportedFiles: ["img", "pdf"],
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
        serviceTier: "priority",
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
        reasoningEffort: "high",
        serviceTier: "priority",
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
  "Gemini Nano Banana": {
    model: google("gemini-2.5-flash-image-preview"),
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
  "Grok 3 Mini": {
    model: xai("grok-3-mini"),
    company: "xai",
  },
  "Grok 4": {
    model: xai("grok-4-0709"),
    company: "xai",
    supportedFiles: ["img", "pdf"],
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
  "Llama 4",
  "Kimi K2",
  "Qwen 3",
  "Qwen 3 Coder",
  "Deepseek Chat",
  "Deepseek R1",
  "Sonar",
  "Sonar Pro",
  "Sonar Reasoning",
  "Claude Haiku 3.5",
  "Claude Sonnet 4",
  "Claude Opus 4.1",
  "Grok Code Fast",
  "Grok 3 Mini",
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
