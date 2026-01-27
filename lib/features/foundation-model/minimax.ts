import { wrapLanguageModel } from "ai";
import { reasoningMw } from "./utils";
import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const MINIMAX_CONFIG = {
  "MiniMax M2.1": {
    model: wrapLanguageModel({
      model: providers.gateway("minimax/minimax-m2.1"),
      middleware: [reasoningMw],
    }),
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
} as const satisfies Record<string, ModelConfiguration>;
