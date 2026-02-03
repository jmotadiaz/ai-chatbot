import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const XIAOMI_CONFIG = {
  "MiMo V2 Flash": {
    model: providers.openrouter("xiaomi/mimo-v2-flash"),
    company: "xiaomi",
    temperature: 0.8,
    topP: 0.95,
  },
  "MiMo V2 Flash Thinking": {
    model: providers.openrouter("xiaomi/mimo-v2-flash"),
    reasoning: true,
    company: "xiaomi",
    temperature: 0.8,
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
