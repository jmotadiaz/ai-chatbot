import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const MOONSHOTAI_CONFIG = {
  "Kimi K2.6": {
    model: providers.opencodeGo("kimi-k2.6"),
    company: "moonshotai",
    reasoning: true,
    supportedFiles: ["img", "pdf"],
    temperature: 1.0,
    topP: 0.95,
  },
} as const satisfies Record<string, ModelConfiguration>;
