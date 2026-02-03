import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const ALIBABA_CONFIG = {
  "Qwen3 Next Instruct": {
    model: providers.gateway("alibaba/qwen3-next-80b-a3b-instruct"),
    company: "alibaba",
    temperature: 0.7,
    topP: 0.8,
    providerOptions: {
      gateway: {
        zeroDataRetention: true,
        only: ["deepinfra"],
      },
    },
  },
  "Qwen3 Next Thinking": {
    model: providers.gateway("alibaba/qwen3-next-80b-a3b-thinking"),
    reasoning: true,
    company: "alibaba",
    temperature: 0.6,
    topP: 0.95,
  },
  "Qwen3 30b": {
    model: providers.lmstudio("qwen/qwen3-30b-a3b-2507"),
    company: "alibaba",
    temperature: 0.6,
  },
  "Qwen3 Coder": {
    model: providers.openrouter("qwen/qwen3-coder"),
    company: "alibaba",
    temperature: 0.6,
  },
} as const satisfies Record<string, ModelConfiguration>;
