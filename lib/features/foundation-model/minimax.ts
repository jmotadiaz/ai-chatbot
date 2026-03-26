import { wrapLanguageModel } from "ai";
import { reasoningMw } from "./utils";
import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const MINIMAX_CONFIG = {
  "MiniMax M2.7": {
    model: wrapLanguageModel({
      model: providers.openrouter("minimax/minimax-m2.7"),
      middleware: [reasoningMw],
    }),
    reasoning: true,
    company: "minimax",
    temperature: 1,
    topP: 0.9,
  },
  "MiniMax M2.5": {
    model: providers.deepinfra("MiniMaxAI/MiniMax-M2.5"),
    reasoning: true,
    company: "minimax",
    temperature: 1,
  },
} as const satisfies Record<string, ModelConfiguration>;
