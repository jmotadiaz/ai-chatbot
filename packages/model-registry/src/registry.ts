import type { ModelDefinition } from "./types";

const _MODEL_REGISTRY = {
  // --- Alibaba ---
  "Qwen 3.5 Flash": {
    id: "Qwen 3.5 Flash",
    metadata: { company: "alibaba" },
    aiSdkProvider: "gateway",
    aiSdkModelId: "alibaba/qwen-3.5-flash",
    chatEnabled: true,
  },
  "Qwen 3.6 Plus": {
    id: "Qwen 3.6 Plus",
    metadata: { company: "alibaba" },
    aiSdkProvider: "gateway",
    aiSdkModelId: "alibaba/qwen-3.6-plus",
    chatEnabled: true,
    codingAgentMapping: { providerId: "opencode-go", modelId: "qwen3.6-plus" },
  },
  "Qwen3 30b": {
    id: "Qwen3 30b",
    metadata: { company: "alibaba" },
    aiSdkProvider: "gateway",
    aiSdkModelId: "alibaba/qwen3-30b",
    chatEnabled: false,
  },
  "Qwen3 Coder": {
    id: "Qwen3 Coder",
    metadata: { company: "alibaba" },
    aiSdkProvider: "gateway",
    aiSdkModelId: "alibaba/qwen3-coder",
    chatEnabled: false,
  },

  // --- Anthropic ---
  "Claude Haiku 4.5": {
    id: "Claude Haiku 4.5",
    metadata: {
      company: "anthropic",
      supportedFiles: ["img", "pdf"],
      providerOptions: {
        anthropic: { sendReasoning: true, thinking: { type: "enabled", budgetTokens: 10000 } },
        gateway: { zeroDataRetention: true },
      },
    },
    aiSdkProvider: "gateway",
    aiSdkModelId: "anthropic/claude-haiku-4.5",
    chatEnabled: true,
  },
  "Claude Sonnet 4.6": {
    id: "Claude Sonnet 4.6",
    metadata: {
      company: "anthropic",
      reasoning: true,
      supportedFiles: ["img", "pdf"],
      providerOptions: {
        anthropic: { sendReasoning: true, thinking: { type: "enabled", budgetTokens: 10000 } },
        gateway: { zeroDataRetention: true },
      },
    },
    aiSdkProvider: "gateway",
    aiSdkModelId: "anthropic/claude-sonnet-4.6",
    chatEnabled: true,
  },
  "Claude Opus 4.5": {
    id: "Claude Opus 4.5",
    metadata: {
      company: "anthropic",
      reasoning: true,
      supportedFiles: ["img", "pdf"],
      providerOptions: {
        anthropic: { sendReasoning: true, thinking: { type: "enabled", budgetTokens: 10000 } },
        gateway: { zeroDataRetention: true },
      },
    },
    aiSdkProvider: "gateway",
    aiSdkModelId: "anthropic/claude-opus-4.5",
    chatEnabled: true,
  },

  // --- DeepSeek ---
  "Deepseek v4 Flash": {
    id: "Deepseek v4 Flash",
    metadata: { company: "deepseek" },
    aiSdkProvider: "deepseek",
    aiSdkModelId: "deepseek-v4-flash",
    chatEnabled: true,
    codingAgentMapping: { providerId: "opencode-go", modelId: "deepseek-v4-flash" },
  },
  "Deepseek v4 Pro": {
    id: "Deepseek v4 Pro",
    metadata: { company: "deepseek" },
    aiSdkProvider: "deepseek",
    aiSdkModelId: "deepseek-v4-pro",
    chatEnabled: true,
    codingAgentMapping: { providerId: "opencode-go", modelId: "deepseek-v4-pro" },
  },

  // --- Google ---
  "Gemini 2.5 Flash Lite": {
    id: "Gemini 2.5 Flash Lite",
    metadata: { company: "google", temperature: 0.6, reasoning: true },
    aiSdkProvider: "openrouter",
    aiSdkModelId: "google/gemini-2.5-flash-lite",
    chatEnabled: false,
  },
  "Gemini 2.5 Flash": {
    id: "Gemini 2.5 Flash",
    metadata: {
      company: "google",
      temperature: 0.6,
      reasoning: true,
      providerOptions: {
        google: { thinkingConfig: { thinkingBudget: 0, includeThoughts: false } },
      },
    },
    aiSdkProvider: "openrouter",
    aiSdkModelId: "google/gemini-2.5-flash",
    chatEnabled: false,
  },
  "Gemini 3 Flash": {
    id: "Gemini 3 Flash",
    metadata: {
      company: "google",
      temperature: 0.6,
      reasoning: true,
      supportedFiles: ["img", "pdf"],
      providerOptions: {
        google: { thinkingConfig: { includeThoughts: true, thinkingLevel: "high" } },
      },
    },
    aiSdkProvider: "openrouter",
    aiSdkModelId: "google/gemini-3-flash-preview",
    chatEnabled: true,
  },
  "Gemini 3.1 Flash Lite": {
    id: "Gemini 3.1 Flash Lite",
    metadata: { company: "google", temperature: 0.6 },
    aiSdkProvider: "openrouter",
    aiSdkModelId: "google/gemini-3.1-flash-lite-preview",
    chatEnabled: true,
  },
  "Gemini 3.1 Pro": {
    id: "Gemini 3.1 Pro",
    metadata: {
      company: "google",
      temperature: 0.6,
      supportedFiles: ["img", "pdf"],
      providerOptions: {
        google: { thinkingConfig: { thinkingLevel: "high" } },
      },
    },
    aiSdkProvider: "openrouter",
    aiSdkModelId: "google/gemini-3.1-pro-preview",
    chatEnabled: true,
  },
  "Nano Banana": {
    id: "Nano Banana",
    metadata: {
      company: "google",
      temperature: 0.6,
      supportedFiles: ["img"],
      supportedOutput: ["img"],
    },
    aiSdkProvider: "openrouter",
    aiSdkModelId: "google/gemini-2.5-flash-image",
    chatEnabled: false,
  },

  // --- Meta ---
  "Llama 3.1 Instant": {
    id: "Llama 3.1 Instant",
    metadata: { company: "meta" },
    aiSdkProvider: "gateway",
    aiSdkModelId: "meta/llama-3.1-instant",
    chatEnabled: false,
  },
  "Llama 3.3": {
    id: "Llama 3.3",
    metadata: { company: "meta" },
    aiSdkProvider: "gateway",
    aiSdkModelId: "meta/llama-3.3",
    chatEnabled: false,
  },
  "Llama 4 Scout": {
    id: "Llama 4 Scout",
    metadata: { company: "meta" },
    aiSdkProvider: "gateway",
    aiSdkModelId: "meta/llama-4-scout",
    chatEnabled: false,
  },
  "Llama 4 Maverick": {
    id: "Llama 4 Maverick",
    metadata: { company: "meta" },
    aiSdkProvider: "gateway",
    aiSdkModelId: "meta/llama-4-maverick",
    chatEnabled: false,
  },

  // --- MiniMax ---
  "MiniMax M2.7": {
    id: "MiniMax M2.7",
    metadata: { company: "minimax" },
    aiSdkProvider: "gateway",
    aiSdkModelId: "minimax/minimax-m2.7",
    chatEnabled: true,
  },
  "MiniMax M2.5": {
    id: "MiniMax M2.5",
    metadata: { company: "minimax" },
    aiSdkProvider: "gateway",
    aiSdkModelId: "minimax/minimax-m2.5",
    chatEnabled: false,
  },

  // --- Mistral ---
  "Magistral Medium": {
    id: "Magistral Medium",
    metadata: { company: "mistral" },
    aiSdkProvider: "gateway",
    aiSdkModelId: "mistral/magistral-medium",
    chatEnabled: false,
  },
  "Magistral Small": {
    id: "Magistral Small",
    metadata: { company: "mistral" },
    aiSdkProvider: "gateway",
    aiSdkModelId: "mistral/magistral-small",
    chatEnabled: false,
  },

  // --- MoonshotAI ---
  "Kimi K2.6": {
    id: "Kimi K2.6",
    metadata: { company: "moonshotai" },
    aiSdkProvider: "openrouter",
    aiSdkModelId: "moonshotai/kimi-k2.6",
    chatEnabled: true,
    codingAgentMapping: { providerId: "opencode-go", modelId: "kimi-k2.6" },
  },

  // --- NVIDIA ---
  "Nemotron 3 Nano": {
    id: "Nemotron 3 Nano",
    metadata: { company: "nvidia" },
    aiSdkProvider: "gateway",
    aiSdkModelId: "nvidia/nemotron-3-nano",
    chatEnabled: true,
  },
  "Nemotron 3 Super": {
    id: "Nemotron 3 Super",
    metadata: { company: "nvidia" },
    aiSdkProvider: "gateway",
    aiSdkModelId: "nvidia/nemotron-3-super",
    chatEnabled: true,
  },

  // --- OpenAI ---
  "GPT OSS": {
    id: "GPT OSS",
    metadata: { company: "openai", temperature: 0.6, reasoning: true },
    aiSdkProvider: "gateway",
    aiSdkModelId: "openai/gpt-oss-120b",
    chatEnabled: true,
  },
  "GPT OSS Mini": {
    id: "GPT OSS Mini",
    metadata: { company: "openai", reasoning: true, temperature: 0.6 },
    aiSdkProvider: "openrouter",
    aiSdkModelId: "openai/gpt-oss-20b",
    chatEnabled: false,
  },
  "o4 Mini": {
    id: "o4 Mini",
    metadata: { company: "openai", reasoning: true, temperature: 0.6 },
    aiSdkProvider: "openai",
    aiSdkModelId: "o4-mini",
    chatEnabled: false,
  },
  o3: {
    id: "o3",
    metadata: { company: "openai", reasoning: true, temperature: 0.6 },
    aiSdkProvider: "openai",
    aiSdkModelId: "o3",
    chatEnabled: false,
  },
  "GPT 5 Nano": {
    id: "GPT 5 Nano",
    metadata: {
      company: "openai",
      temperature: 0.6,
      providerOptions: {
        openai: { textVerbosity: "low", serviceTier: "priority" },
      },
    },
    aiSdkProvider: "openai",
    aiSdkModelId: "gpt-5-nano-2025-08-07",
    chatEnabled: false,
  },
  "GPT 5.4 Mini": {
    id: "GPT 5.4 Mini",
    metadata: {
      company: "openai",
      reasoning: true,
      temperature: 0.6,
      supportedFiles: ["img", "pdf"],
      providerOptions: {
        openai: { textVerbosity: "low", reasoningEffort: "high", reasoningSummary: "auto" },
      },
    },
    aiSdkProvider: "openai",
    aiSdkModelId: "gpt-5.4-mini-2026-03-17",
    chatEnabled: true,
  },
  "GPT 5.4": {
    id: "GPT 5.4",
    metadata: {
      company: "openai",
      reasoning: true,
      temperature: 0.6,
      supportedFiles: ["img", "pdf"],
      providerOptions: {
        openai: { textVerbosity: "low", reasoningEffort: "high", reasoningSummary: "auto" },
      },
    },
    aiSdkProvider: "openai",
    aiSdkModelId: "gpt-5.4-2026-03-05",
    chatEnabled: true,
  },

  // --- Perplexity ---
  "Sonar Pro": {
    id: "Sonar Pro",
    metadata: { company: "perplexity" },
    aiSdkProvider: "gateway",
    aiSdkModelId: "perplexity/sonar-pro",
    chatEnabled: false,
  },
  "Sonar Reasoning": {
    id: "Sonar Reasoning",
    metadata: { company: "perplexity" },
    aiSdkProvider: "gateway",
    aiSdkModelId: "perplexity/sonar-reasoning",
    chatEnabled: false,
  },

  // --- xAI ---
  "Grok Code Fast": {
    id: "Grok Code Fast",
    metadata: { company: "xai" },
    aiSdkProvider: "gateway",
    aiSdkModelId: "xai/grok-code-fast",
    chatEnabled: false,
  },
  "Grok 4.1 Fast": {
    id: "Grok 4.1 Fast",
    metadata: { company: "xai" },
    aiSdkProvider: "gateway",
    aiSdkModelId: "xai/grok-4.1-fast",
    chatEnabled: true,
  },
  "Grok 4.3": {
    id: "Grok 4.3",
    metadata: { company: "xai" },
    aiSdkProvider: "gateway",
    aiSdkModelId: "xai/grok-4.3",
    chatEnabled: true,
  },

  // --- Xiaomi ---
  "MiMo V2.5": {
    id: "MiMo V2.5",
    metadata: { company: "xiaomi" },
    aiSdkProvider: "gateway",
    aiSdkModelId: "xiaomi/mimo-v2.5",
    chatEnabled: true,
    codingAgentMapping: { providerId: "opencode-go", modelId: "mimo-v2.5" },
  },
  "MiMo V2.5 Pro": {
    id: "MiMo V2.5 Pro",
    metadata: { company: "xiaomi" },
    aiSdkProvider: "gateway",
    aiSdkModelId: "xiaomi/mimo-v2.5-pro",
    chatEnabled: true,
    codingAgentMapping: { providerId: "opencode-go", modelId: "mimo-v2.5-pro" },
  },

  // --- Zai ---
  "GLM-4.7": {
    id: "GLM-4.7",
    metadata: { company: "zai" },
    aiSdkProvider: "openrouter",
    aiSdkModelId: "zai/glm-4.7",
    chatEnabled: false,
  },
  "GLM-4.7 Flash": {
    id: "GLM-4.7 Flash",
    metadata: { company: "zai" },
    aiSdkProvider: "openrouter",
    aiSdkModelId: "zai/glm-4.7-flash",
    chatEnabled: true,
  },
  "GLM-5.1": {
    id: "GLM-5.1",
    metadata: { company: "zai" },
    aiSdkProvider: "openrouter",
    aiSdkModelId: "zai/glm-5.1",
    chatEnabled: true,
  },

  // --- StepFun ---
  "StepFun 3.5": {
    id: "StepFun 3.5",
    metadata: { company: "stepfun" },
    aiSdkProvider: "openrouter",
    aiSdkModelId: "stepfun/stepfun-3.5",
    chatEnabled: false,
  },
} as const;

export const MODEL_REGISTRY: Record<string, ModelDefinition> = _MODEL_REGISTRY;
export type ModelRegistryKeys = keyof typeof _MODEL_REGISTRY;
