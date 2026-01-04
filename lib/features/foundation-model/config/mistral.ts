import { providers } from "@/lib/infrastructure/ai/providers";
import type { ModelConfiguration } from "../types";

export const MISTRAL_CONFIG = {
  "Magistral Medium": {
    model: providers.openrouter("mistralai/magistral-medium-2506:thinking"),
    company: "mistral",
    temperature: 0.6,
    providerOptions: {
      openrouter: { reasoning: { enabled: true, effort: "high" } },
    },
  },
  "Magistral Small": {
    model: providers.openrouter("mistralai/magistral-small-2506"),
    company: "mistral",
    temperature: 0.6,
  },
} as const satisfies Record<string, ModelConfiguration>;
