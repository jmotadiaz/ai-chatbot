import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const ANTHROPIC_CONFIG = {
  "Claude Haiku 4.5": {
    model: providers.gateway("anthropic/claude-haiku-4.5"),
    company: "anthropic",
    supportedFiles: ["img", "pdf"],
    providerOptions: {
      anthropic: {
        sendReasoning: true,
        thinking: { type: "enabled", budgetTokens: 10000 },
      },
      gateway: {
        zeroDataRetention: true,
      },
    },
  },
  "Claude Sonnet 4.6": {
    model: providers.gateway("anthropic/claude-sonnet-4.6"),
    company: "anthropic",
    supportedFiles: ["img", "pdf"],
    reasoning: true,
    providerOptions: {
      anthropic: {
        sendReasoning: true,
        thinking: { type: "enabled", budgetTokens: 10000 },
      },
      gateway: {
        zeroDataRetention: true,
      },
    },
  },
  "Claude Opus 4.5": {
    model: providers.gateway("anthropic/claude-opus-4.5"),
    company: "anthropic",
    supportedFiles: ["img", "pdf"],
    reasoning: true,
    providerOptions: {
      anthropic: {
        sendReasoning: true,
        thinking: { type: "enabled", budgetTokens: 10000 },
      },
      gateway: {
        zeroDataRetention: true,
      },
    },
  },
} as const satisfies Record<string, ModelConfiguration>;
