import { providers } from "@/lib/infrastructure/ai/providers";
import type { ModelConfiguration } from "../types";

export const ZAI_CONFIG = {
  "GLM-4.6": {
    model: providers.gateway("zai/glm-4.7"),
    reasoning: true,
    company: "zai",
    temperature: 1,
    topP: 0.95,
    providerOptions: {
      gateway: {
        zeroDataRetention: true,
      },
    },
  },
} as const satisfies Record<string, ModelConfiguration>;
