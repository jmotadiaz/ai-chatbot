import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const ALIBABA_CONFIG = {
  "Qwen 3.5 Flash": {
    model: providers.gateway("alibaba/qwen3.5-flash"),
    company: "alibaba",
  },
  "Qwen 3.5 Plus": {
    model: providers.gateway("alibaba/qwen3.5-plus"),
    company: "alibaba",
    reasoning: true,
    supportedFiles: ["pdf", "img"],
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
