import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const MOONSHOTAI_CONFIG = {
  "Kimi K2": {
    model: providers.groq("moonshotai/kimi-k2.5"),
    company: "moonshotai",
    temperature: 1,
    topP: 0.95,
  },
  "Kimi K2 Thinking": {
    model: providers.openrouter("moonshotai/kimi-k2-thinking"),
    company: "moonshotai",
    reasoning: true,
    temperature: 1.0,
  },
} as const satisfies Record<string, ModelConfiguration>;
