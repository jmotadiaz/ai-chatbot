import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const DEEPSEEK_CONFIG = {
  "Deepseek Chat": {
    model: providers.gateway("deepseek/deepseek-v4-flash"),
    company: "deepseek",
    temperature: 1,
    topP: 0.95,
  },
  "Deepseek Reasoner": {
    model: providers.gateway("deepseek/deepseek-v4-pro"),
    company: "deepseek",
    reasoning: true,
    temperature: 1,
    topP: 0.95,
  },
} as const satisfies Record<string, ModelConfiguration>;
