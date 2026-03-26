import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const XIAOMI_CONFIG = {
  "MiMo V2 Flash": {
    model: providers.openrouter("xiaomi/mimo-v2-flash"),
    company: "xiaomi",
    temperature: 0.6,
    topP: 0.95,
  },
  "MiMo V2 Pro": {
    model: providers.openrouter("xiaomi/mimo-v2-pro"),
    reasoning: true,
    company: "xiaomi",
    temperature: 0.6,
    topP: 0.95,
  },
} as const satisfies Record<string, ModelConfiguration>;
