import { providers } from "@/lib/infrastructure/ai/providers";
import type { ModelConfiguration } from "../types";

export const XIAOMI_CONFIG = {
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
} as const satisfies Record<string, ModelConfiguration>;
