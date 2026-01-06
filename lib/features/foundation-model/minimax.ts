import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const MINIMAX_CONFIG = {
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
} as const satisfies Record<string, ModelConfiguration>;
