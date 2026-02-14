import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const ZAI_CONFIG = {
  "GLM-4.7": {
    model: providers.openrouter("z-ai/glm-4.7"),
    reasoning: true,
    company: "zai",
    temperature: 1,
    topP: 0.95,
    providerOptions: {
      gateway: {
        order: ["deepinfra", "cerebras"],
      },
    },
  },
  "GLM-4.7 Flash": {
    model: providers.openrouter("z-ai/glm-4.7-flash"),
    reasoning: true,
    company: "zai",
    temperature: 1,
    topP: 0.95,
  },
  "GLM-5": {
    model: providers.openrouter("z-ai/glm-5"),
    reasoning: true,
    company: "zai",
    temperature: 1,
    topP: 0.95,
    providerOptions: {
      openrouter: {
        reasoning: {
          enabled: false,
          exclude: true,
          max_tokens: 0,
        },
      },
    },
  },
  "GLM-5 Thinking": {
    model: providers.openrouter("z-ai/glm-5"),
    reasoning: true,
    company: "zai",
    temperature: 1,
    topP: 0.95,
    providerOptions: {
      openrouter: {
        reasoning: {
          effort: "high",
        },
      },
    },
  },
} as const satisfies Record<string, ModelConfiguration>;
