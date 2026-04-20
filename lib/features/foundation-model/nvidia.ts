import { ModelConfiguration } from "@/lib/features/foundation-model/types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const NVIDIA_CONFIG = {
  "Nemotron 3 Nano": {
    model: providers.openrouter("nvidia/nemotron-3-nano-30b-a3b:free"),
    company: "nvidia",
    temperature: 0.6,
    topP: 0.95,
    reasoning: true,
  },
  "Nemotron 3 Super": {
    model: providers.openrouter("nvidia/nemotron-3-super-120b-a12b:free"),
    company: "nvidia",
    temperature: 1,
    topP: 0.95,
    reasoning: true,
  },
} as const satisfies Record<string, ModelConfiguration>;
