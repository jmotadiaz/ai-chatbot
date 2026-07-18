import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const META_CONFIG = {
  "Llama 3.1 Instant": {
    model: providers.openrouter("meta-llama/llama-3.1-8b-instruct"),
    company: "meta",
    temperature: 0.6,
  },
  "Llama 3.3": {
    model: providers.groq("llama-3.3-70b-versatile"),
    company: "meta",
    temperature: 0.6,
  },
  "Llama 4 Scout": {
    model: providers.openrouter("meta-llama/llama-4-scout"),
    company: "meta",
    temperature: 0.6,
    supportedFiles: ["img"],
  },
  "Llama 4 Maverick": {
    model: providers.openrouter("meta-llama/llama-4-maverick"),
    company: "meta",
    temperature: 0.6,
    supportedFiles: ["img"],
  },
} as const satisfies Record<string, ModelConfiguration>;
