import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const XAI_CONFIG = {
  "Grok Code Fast": {
    model: providers.xai("grok-code-fast-1"),
    company: "xai",
    temperature: 0.6,
  },
  "Grok 4.1 Fast": {
    model: providers.xai("grok-4-1-fast"),
    company: "xai",
    temperature: 0.6,
    supportedFiles: ["img"],
    reasoning: true,
  },
  "Grok 4.20": {
    model: providers.xai("grok-4.20-0309-reasoning"),
    company: "xai",
    temperature: 0.6,
    supportedFiles: ["img"],
    reasoning: true,
  },
} as const satisfies Record<string, ModelConfiguration>;
