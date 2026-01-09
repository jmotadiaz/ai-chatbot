import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const DEEPSEEK_CONFIG = {
  "Deepseek Chat": {
    model: providers.deepseek("deepseek-chat"),
    company: "deepseek",
    temperature: 0.6,
  },
  "Deepseek Reasoner": {
    model: providers.deepseek("deepseek-reasoner"),
    company: "deepseek",
    reasoning: true,
    toolCalling: false,
    temperature: 0.6,
    topP: 0.95,
  },
} as const satisfies Record<string, ModelConfiguration>;
