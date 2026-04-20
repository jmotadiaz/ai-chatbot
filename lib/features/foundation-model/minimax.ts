import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const MINIMAX_CONFIG = {
  "MiniMax M2.7": {
    model: providers.gateway("minimax/minimax-m2.7"),
    reasoning: true,
    company: "minimax",
    temperature: 1,
    topP: 0.9,
    providerOptions: {
      gateway: {
        zeroDataRetention: true,
      },
    },
  },
  "MiniMax M2.5": {
    model: providers.gateway("minimax/minimax-m2.5"),
    reasoning: true,
    company: "minimax",
    temperature: 1,
    providerOptions: {
      gateway: {
        zeroDataRetention: true,
      },
    },
  },
} as const satisfies Record<string, ModelConfiguration>;
