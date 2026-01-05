import type { ModelConfiguration } from "../types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const MOONSHOTAI_CONFIG = {
  "Kimi K2": {
    model: providers.groq("moonshotai/kimi-k2-instruct-0905"),
    company: "moonshotai",
    temperature: 0.6,
  },
  "Kimi K2 Thinking": {
    model: providers.gateway("moonshotai/kimi-k2-thinking-turbo"),
    company: "moonshotai",
    reasoning: true,
    temperature: 1.0,
  },
} as const satisfies Record<string, ModelConfiguration>;
