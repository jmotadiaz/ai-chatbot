import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const XIAOMI_CONFIG = {
  "MiMo V2.5": {
    model: providers.opencodeGo("mimo-v2.5"),
    company: "xiaomi",
    reasoning: true,
    temperature: 0.6,
    topP: 0.95,
  },
  "MiMo V2.5 Pro": {
    model: providers.opencodeGo("mimo-v2.5-pro"),
    reasoning: true,
    company: "xiaomi",
    temperature: 0.6,
    topP: 0.95,
  },
} as const satisfies Record<string, ModelConfiguration>;
