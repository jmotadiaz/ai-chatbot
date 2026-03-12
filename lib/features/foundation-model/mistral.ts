import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const MISTRAL_CONFIG = {
  "Magistral Medium": {
    model: providers.openrouter("mistralai/mistral-medium-3.1"),
    company: "mistral",
    temperature: 0.6,
  },
  "Magistral Small": {
    model: providers.openrouter("mistralai/mistral-small-3.2-24b-instruct"),
    company: "mistral",
    temperature: 0.6,
  },
} as const satisfies Record<string, ModelConfiguration>;
