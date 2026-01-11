import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const ZAI_CONFIG = {
  "GLM-4.7": {
    model: providers.gateway("zai/glm-4.7"),
    reasoning: true,
    company: "zai",
    temperature: 1,
    topP: 0.95,
    providerOptions: {
      gateway: {
        zeroDataRetention: true,
        order: ["deepinfra", "cerebras"],
      },
    },
  },
} as const satisfies Record<string, ModelConfiguration>;
