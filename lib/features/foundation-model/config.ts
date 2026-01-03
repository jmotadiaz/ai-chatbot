import { extractReasoningMiddleware, wrapLanguageModel } from "ai";
import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

const reasoningMw = extractReasoningMiddleware({
  tagName: "think",
  separator: "\n",
  startWithReasoning: true,
});

const LANGUAGE_MODEL_CONFIGURATIONS_CONST = {
  "Llama 3.1 Instant": {
    model: providers.gateway("meta/llama-3.1-8b"),
    company: "meta",
    temperature: 0.6,
    providerOptions: {
      gateway: {
        zeroDataRetention: true,
        order: ["cerebras", "deepinfra", "bedrock"],
        only: ["cerebras", "deepinfra", "bedrock"],
      },
    },
  },
  "Llama 3.3": {
    model: providers.groq("llama-3.3-70b-versatile"),
    company: "meta",
    temperature: 0.6,
  },
  "Llama 4 Scout": {
    model: providers.gateway("meta/llama-4-scout"),
    company: "meta",
    temperature: 0.6,
    supportedFiles: ["img"],
    providerOptions: {
      gateway: {
        zeroDataRetention: true,
        order: ["deepinfra", "bedrock"],
        only: ["deepinfra", "bedrock"],
      },
    },
  },
  "Llama 4 Maverick": {
    model: providers.gateway("meta/llama-4-maverick"),
    company: "meta",
    temperature: 0.6,
    supportedFiles: ["img"],
    providerOptions: {
      gateway: {
        zeroDataRetention: true,
        order: ["deepinfra", "bedrock"],
        only: ["deepinfra", "bedrock"],
      },
    },
  },
  "Kimi K2": {
    model: providers.gateway("moonshotai/kimi-k2-0905"),
    company: "moonshotai",
    temperature: 0.6,
    providerOptions: {
      gateway: {
        zeroDataRetention: true,
        only: ["baseten"],
      },
    },
  },
  "Kimi K2 Thinking": {
    model: providers.gateway("moonshotai/kimi-k2-thinking-turbo"),
    company: "moonshotai",
    reasoning: true,
    temperature: 1.0,
  },
  "Magistral Medium": {
    model: providers.openrouter("mistralai/magistral-medium-2506:thinking"),
    company: "mistral",
    temperature: 0.6,
    providerOptions: {
      openrouter: { reasoning: { enabled: true, effort: "high" } },
    },
  },
  "Magistral Small": {
    model: providers.openrouter("mistralai/magistral-small-2506"),
    company: "mistral",
    temperature: 0.6,
  },
  "Deepseek Chat": {
    model: providers.deepseek("deepseek-chat"),
    company: "deepseek",
    temperature: 0.6,
  },
  "Deepseek R1": {
    model: providers.gateway("deepseek/deepseek-r1"),
    company: "deepseek",
    reasoning: true,
    temperature: 0.6,
    topP: 0.95,
  },
  "Qwen3 Instruct": {
    model: providers.gateway("alibaba/qwen3-next-80b-a3b-instruct"),
    company: "alibaba",
    temperature: 0.7,
    topP: 0.8,
    providerOptions: {
      gateway: {
        zeroDataRetention: true,
        only: ["deepinfra"],
      },
    },
  },
  "Qwen3 Thinking": {
    model: providers.gateway("alibaba/qwen3-235b-a22b-thinking"),
    reasoning: true,
    company: "alibaba",
    temperature: 0.6,
    topP: 0.95,
    providerOptions: {
      gateway: {
        zeroDataRetention: true,
        only: ["deepinfra"],
      },
    },
  },
  "Qwen3 30b": {
    model: providers.lmstudio("qwen/qwen3-30b-a3b-2507"),
    company: "alibaba",
    temperature: 0.6,
  },
  "Qwen3 Coder": {
    model: providers.openrouter("qwen/qwen3-coder"),
    company: "alibaba",
    temperature: 0.6,
  },
  "MiniMax M2": {
    model: providers.gateway("minimax/minimax-m2"),
    reasoning: true,
    company: "minimax",
    temperature: 1,
    topP: 0.9,
    topK: 40,
    providerOptions: {
      gateway: {
        zeroDataRetention: true,
        only: ["deepinfra"],
      },
    },
  },
  "MiMo V2 Flash": {
    model: providers.openrouter("xiaomi/mimo-v2-flash:free"),
    reasoning: true,
    company: "xiaomi",
    temperature: 0.8,
    topP: 0.95,
    providerOptions: {
      openrouter: {
        reasoning: {
          enabled: true,
          effort: "medium"
        },
      },
    },
  },
  "GLM-4.6": {
    model: wrapLanguageModel({
      model: providers.gateway("zai/glm-4.6"),
      middleware: [reasoningMw],
    }),
    reasoning: true,
    company: "zai",
    temperature: 1,
    topP: 0.9,
    topK: 40,
    providerOptions: {
      gateway: {
        zeroDataRetention: true,
        order: ["deepinfra", "baseten"],
        only: ["deepinfra", "baseten"],
      },
    },
  },
  Sonar: {
    model: providers.perplexity("sonar"),
    company: "perplexity",
    temperature: 0.6,
    supportedFiles: ["img"],
    toolCalling: false,
  },
  "Sonar Pro": {
    model: providers.perplexity("sonar-pro"),
    company: "perplexity",
    temperature: 0.6,
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
    temperature: 0.6,
    supportedFiles: ["img"],
    toolCalling: false,
  },
  "Claude Haiku 4.5": {
    model: providers.gateway("anthropic/claude-haiku-4.5"),
    company: "anthropic",
    temperature: 0.6,
    supportedFiles: ["img", "pdf"],
    providerOptions: {
      gateway: {
        zeroDataRetention: true,
        only: ["anthropic"],
      },
    },
  },
  "Claude Sonnet 4.5": {
    model: providers.gateway("anthropic/claude-sonnet-4.5"),
    company: "anthropic",
    temperature: 0.6,
    supportedFiles: ["img", "pdf"],
    reasoning: true,
    providerOptions: {
      anthropic: {
        sendReasoning: true,
        thinking: { type: "enabled", budgetTokens: 10000 },
      },
      gateway: {
        zeroDataRetention: true,
        only: ["anthropic"],
      },
    },
  },
  "Claude Opus 4.5": {
    model: providers.gateway("anthropic/claude-opus-4.5"),
    company: "anthropic",
    temperature: 0.6,
    supportedFiles: ["img", "pdf"],
    reasoning: true,
    providerOptions: {
      anthropic: {
        sendReasoning: true,
        thinking: { type: "enabled", budgetTokens: 10000 },
      },
      gateway: {
        zeroDataRetention: true,
        only: ["anthropic"],
      },
    },
  },
  "GPT OSS": {
    model: providers.gateway("openai/gpt-oss-120b"),
    company: "openai",
    temperature: 0.6,
    reasoning: true,
    providerOptions: {
      openai: { reasoningEffort: "high" },
      gateway: {
        zeroDataRetention: true,
        order: ["cerebras", "baseten"],
        only: ["cerebras", "baseten"],
      },
    },
  },
  "GPT OSS Mini": {
    model: providers.groq("openai/gpt-oss-20b"),
    reasoning: true,
    company: "openai",
    temperature: 0.6,
  },
  "o4 Mini": {
    model: providers.openai("o4-mini"),
    reasoning: true,
    company: "openai",
    temperature: 0.6,
  },
  o3: {
    model: providers.openai("o3"),
    reasoning: true,
    company: "openai",
    temperature: 0.6,
  },
  "GPT 5 Nano": {
    model: providers.openai("gpt-5-nano-2025-08-07"),
    company: "openai",
    temperature: 0.6,
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
    temperature: 0.6,
    providerOptions: {
      openai: {
        textVerbosity: "low",
      },
    },
    supportedFiles: ["img", "pdf"],
  },
  "GPT 5.2": {
    model: providers.openai("gpt-5.2"),
    reasoning: true,
    company: "openai",
    temperature: 0.6,
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
    temperature: 0.6,
    supportedFiles: ["img", "pdf"],
  },
  "Gemini 2.5 Flash Lite": {
    model: providers.gateway("google/gemini-2.5-flash-lite"),
    company: "google",
    temperature: 0.6,
    supportedFiles: ["img", "pdf"],
  },
  "Gemini 2.5 Flash": {
    model: providers.gateway("google/gemini-2.5-flash"),
    company: "google",
    temperature: 0.6,
    supportedFiles: ["img", "pdf"],
    nativeToolCalling: true,
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
    temperature: 0.6,
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
  "Gemini 3 Flash": {
    model: providers.gateway("google/gemini-3-flash"),
    company: "google",
    temperature: 0.6,
    supportedFiles: ["img", "pdf"],
    nativeToolCalling: true,
    reasoning: true,
  },
  "Gemini 3 Pro": {
    model: providers.gateway("google/gemini-3-pro-preview"),
    company: "google",
    supportedFiles: ["img", "pdf"],
    reasoning: true,
    temperature: 1,
    nativeToolCalling: true,
  },
  "Nano Banana": {
    model: providers.gateway("google/gemini-2.5-flash-image"),
    company: "google",
    temperature: 0.6,
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
    temperature: 0.6,
  },
  "Grok 4.1 Fast": {
    model: providers.xai("grok-4-1-fast"),
    company: "xai",
    temperature: 0.6,
    supportedFiles: ["img"],
    reasoning: true,
  },
  "Grok 4": {
    model: providers.xai("grok-4-0709"),
    company: "xai",
    temperature: 0.6,
    supportedFiles: ["img"],
    reasoning: true,
  },
} as const satisfies Record<string, ModelConfiguration>;

// Export this if needed by other files, usually service.ts will use it.
export { LANGUAGE_MODEL_CONFIGURATIONS_CONST };

export type LanguageModelKeys =
  keyof typeof LANGUAGE_MODEL_CONFIGURATIONS_CONST;

export const chatModelKeys = [
  "GPT OSS Mini",
  "GPT OSS",
  "Kimi K2",
  "Kimi K2 Thinking",
  "Qwen3 Instruct",
  "Qwen3 Thinking",
  "MiniMax M2",
  "MiMo V2 Flash",
  "GLM-4.6",
  "Deepseek Chat",
  "Deepseek R1",
  "Llama 4 Scout",
  "Llama 4 Maverick",
  "Sonar",
  "Sonar Pro",
  "Claude Haiku 4.5",
  "Claude Sonnet 4.5",
  "Claude Opus 4.5",
  "Grok 4.1 Fast",
  "Grok 4",
  "GPT 5 Mini",
  "GPT 5.2",
  "Gemini 3 Flash",
  "Gemini 3 Pro",
  "Nano Banana",
] satisfies LanguageModelKeys[];

export type chatModelId = (typeof chatModelKeys)[number] | "Router";

export const CHAT_MODELS: chatModelId[] = ["Router", ...chatModelKeys];
