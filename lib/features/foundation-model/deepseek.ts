import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const DEEPSEEK_CONFIG = {
  "Deepseek Chat": {
    model: providers.deepseek("deepseek-chat"),
    company: "deepseek",
    temperature: 0.6,
  },
  "Deepseek R1": {
    model: providers.gateway("deepseek/deepseek-r1"),
    company: "deepseek",
    reasoning: true,
    temperature: 0.6,
    topP: 0.95,
  },
} as const satisfies Record<string, ModelConfiguration>;
