import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const ZAI_CONFIG = {
  "GLM-4.7": {
    model: providers.openrouter("z-ai/glm-4.7"),
    company: "zai",
    temperature: 0.6,
    topP: 0.95,
  },
  "GLM-4.7 Flash": {
    model: providers.gateway("zai/glm-4.7-flash"),
    company: "zai",
    temperature: 0.6,
    topP: 0.95,
  },
  "GLM-5": {
    model: providers.gateway("zai/glm-5"),
    company: "zai",
    temperature: 0.6,
    topP: 0.95,
  },
} as const satisfies Record<string, ModelConfiguration>;
