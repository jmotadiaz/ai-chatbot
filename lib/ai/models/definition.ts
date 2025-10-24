import type { GroqProviderOptions } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";
import { extractReasoningMiddleware, wrapLanguageModel } from "ai";
import type { XaiProviderOptions } from "@ai-sdk/xai";
import type { OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import type { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import type { AnthropicProviderOptions } from "@ai-sdk/anthropic";
import type { OpenRouterProviderOptions } from "@openrouter/ai-sdk-provider";
import { providers } from "./providers";

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
    model: providers.groq("llama-3.1-8b-instant"),
    company: "meta",
    providerOptions: {
      groq: {
        structuredOutputs: false,
      },
    },
  },
  "Llama 3.3": {
    model: providers.groq("llama-3.3-70b-versatile"),
    company: "meta",
    temperature: 0.6,
    topP: 0.9,
  },
  "Llama 4 Scout": {
    model: providers.groq("meta-llama/llama-4-scout-17b-16e-instruct"),
    company: "meta",
    temperature: 0.6,
    topP: 0.9,
    supportedFiles: ["img"],
  },
  "Llama 4 Maverick": {
    model: providers.groq("meta-llama/llama-4-maverick-17b-128e-instruct"),
    company: "meta",
    temperature: 0.6,
    topP: 0.9,
    supportedFiles: ["img"],
  },
  "Kimi K2": {
    model: providers.groq("moonshotai/kimi-k2-instruct-0905"),
    company: "moonshotai",
    temperature: 0.6,
  },
  "Magistral Medium": {
    model: providers.openrouter("mistralai/magistral-medium-2506:thinking"),
    company: "mistral",
    providerOptions: {
      openrouter: { reasoning: { enabled: true, effort: "high" } },
    },
  },
  "Magistral Small": {
    model: providers.openrouter("mistralai/magistral-small-2506"),
    company: "mistral",
  },
  "Deepseek Chat": {
    model: providers.deepseek("deepseek-chat"),
    company: "deepseek",
    temperature: 0.6,
  },
  "Deepseek R1": {
    model: wrapLanguageModel({
      model: providers.openrouter("deepseek/deepseek-r1-0528"),
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
    model: providers.openrouter("qwen/qwen3-next-80b-a3b-instruct"),
    company: "alibaba",
    temperature: 0.7,
    topP: 0.8,
    topK: 20,
  },
  "Qwen3 Next Thinking": {
    model: wrapLanguageModel({
      model: providers.openrouter("qwen/qwen3-next-80b-a3b-thinking"),
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
    model: providers.openrouter("qwen/qwen3-coder"),
    company: "alibaba",
  },
  Sonar: {
    model: providers.perplexity("sonar"),
    company: "perplexity",
    supportedFiles: ["img"],
    toolCalling: false,
  },
  "Sonar Pro": {
    model: providers.perplexity("sonar-pro"),
    company: "perplexity",
    supportedFiles: ["img"],
    toolCalling: false,
  },
  "Sonar Reasoning": {
    model: wrapLanguageModel({
      model: providers.perplexity("sonar-pro"),
      middleware: [reasoningMw],
    }),
    reasoning: true,
    company: "perplexity",
    supportedFiles: ["img"],
    toolCalling: false,
  },
  "Claude Haiku 4.5": {
    model: providers.anthropic("claude-haiku-4-5"),
    company: "anthropic",
    supportedFiles: ["img", "pdf"],
    disabledConfig: ["topP", "topK"],
  },
  "Claude Sonnet 4.5": {
    model: providers.anthropic("claude-sonnet-4-5-20250929"),
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
    model: providers.anthropic("claude-opus-4-1-20250805"),
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
  "GPT OSS": {
    model: providers.groq("openai/gpt-oss-120b"),
    company: "openai",
    reasoning: true,
    disabledConfig: ["topK"],
    providerOptions: {
      groq: { reasoningEffort: "high" },
    },
  },
  "GPT OSS Mini": {
    model: providers.groq("openai/gpt-oss-20b"),
    reasoning: true,
    company: "openai",
    disabledConfig: ["topK"],
  },
  "o4 Mini": {
    model: providers.openai("o4-mini"),
    reasoning: true,
    company: "openai",
  },
  o3: {
    model: providers.openai("o3"),
    reasoning: true,
    company: "openai",
  },
  "GPT 5 Nano": {
    model: providers.openai("gpt-5-nano-2025-08-07"),
    company: "openai",
    providerOptions: {
      openai: {
        textVerbosity: "low",
        serviceTier: "priority",
      },
    },
  },
  "GPT 5 Mini": {
    model: providers.openai("gpt-5-mini-2025-08-07"),
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
    model: providers.openai("gpt-5-2025-08-07"),
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
    model: providers.gateway("google/gemini-2.0-flash"),
    company: "google",
    supportedFiles: ["img", "pdf"],
  },
  "Gemini 2.5 Flash Lite": {
    model: providers.gateway("google/gemini-2.5-flash-lite"),
    company: "google",
    supportedFiles: ["img", "pdf"],
  },
  "Gemini 2.5 Flash": {
    model: providers.gateway("google/gemini-2.5-flash"),
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
    model: providers.gateway("google/gemini-2.5-pro"),
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
    model: providers.gateway("google/gemini-2.5-flash-image-preview"),
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
    model: providers.xai("grok-code-fast-1"),
    company: "xai",
  },
  "Grok 4 Fast": {
    model: providers.xai("grok-4-fast"),
    company: "xai",
    supportedFiles: ["img"],
    reasoning: true,
  },
  "Grok 4": {
    model: providers.xai("grok-4-0709"),
    company: "xai",
    supportedFiles: ["img"],
    reasoning: true,
  },
} as const satisfies Record<string, ModelConfiguration>;

export type LanguageModelKeys =
  keyof typeof LANGUAGE_MODEL_CONFIGURATIONS_CONST;

export const languageModelConfigurations = (
  modelKey: LanguageModelKeys
): ModelConfiguration => LANGUAGE_MODEL_CONFIGURATIONS_CONST[modelKey];

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
  "Claude Haiku 4.5",
  "Claude Sonnet 4.5",
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

export type chatModelId = (typeof chatModelKeys)[number] | "Router";

export const CHAT_MODELS: chatModelId[] = ["Router", ...chatModelKeys];

export const defaultModel: chatModelId = "Router";
export const defaultTemperature = 0.5;
export const defaultTopP = 0.95;
export const defaultTopK = 40;
