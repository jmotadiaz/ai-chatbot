import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const DEEPSEEK_CONFIG = {
  "Deepseek Chat": {
    model: providers.deepseek("deepseek-chat"),
    company: "deepseek",
    temperature: 1,
    topP: 0.95,
  },
  "Deepseek Reasoner": {
    model: providers.deepseek("deepseek-reasoner"),
    company: "deepseek",
    reasoning: true,
    temperature: 1,
    topP: 0.95,
  },
} as const satisfies Record<string, ModelConfiguration>;
