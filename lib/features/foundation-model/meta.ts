import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const META_CONFIG = {
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
} as const satisfies Record<string, ModelConfiguration>;
