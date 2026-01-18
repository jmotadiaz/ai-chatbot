import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const ANTHROPIC_CONFIG = {
  "Claude Haiku 4.5": {
    model: providers.gateway("anthropic/claude-haiku-4.5"),
    company: "anthropic",
    temperature: 0.6,
    supportedFiles: ["img", "pdf"],
    nativeToolCalling: true,
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
  "Claude Sonnet 4.5": {
    model: providers.gateway("anthropic/claude-sonnet-4.5"),
    company: "anthropic",
    temperature: 0.6,
    supportedFiles: ["img", "pdf"],
    reasoning: true,
    nativeToolCalling: true, // Use prompts instead of toolChoice for extended thinking
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
    nativeToolCalling: true, // Use prompts instead of toolChoice for extended thinking
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
} as const satisfies Record<string, ModelConfiguration>;
