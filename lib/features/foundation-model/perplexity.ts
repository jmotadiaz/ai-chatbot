import { wrapLanguageModel } from "ai";
import type { ModelConfiguration } from "./types";
import { reasoningMw } from "./utils";
import { providers } from "@/lib/infrastructure/ai/providers";

export const PERPLEXITY_CONFIG = {
  Sonar: {
    model: providers.perplexity("sonar"),
    company: "perplexity",
    temperature: 0.6,
    supportedFiles: ["img"],
    toolCalling: false,
  },
  "Sonar Pro": {
    model: providers.perplexity("sonar-pro"),
    company: "perplexity",
    temperature: 0.6,
    supportedFiles: ["img"],
    toolCalling: false,
  },
  "Sonar Reasoning": {
    model: wrapLanguageModel({
      model: providers.perplexity("sonar-pro"),
      middleware: [reasoningMw],
    }),
    reasoning: true,
    company: "perplexity",
    temperature: 0.6,
    supportedFiles: ["img"],
    toolCalling: false,
  },
} as const satisfies Record<string, ModelConfiguration>;
