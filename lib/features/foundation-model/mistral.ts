import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const MISTRAL_CONFIG = {
  "Magistral Medium": {
    model: providers.gateway("mistral/magistral-medium"),
    company: "mistral",
    temperature: 0.6,
  },
  "Magistral Small": {
    model: providers.gateway("mistral/magistral-small"),
    company: "mistral",
    temperature: 0.6,
  },
} as const satisfies Record<string, ModelConfiguration>;
