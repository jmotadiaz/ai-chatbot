import { providers } from "@/lib/infrastructure/ai/providers";
import type { ModelConfiguration } from "../types";

export const MOONSHOTAI_CONFIG = {
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
} as const satisfies Record<string, ModelConfiguration>;
