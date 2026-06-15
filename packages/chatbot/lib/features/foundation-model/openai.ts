import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const OPENAI_CONFIG = {
  "GPT OSS": {
    model: providers.gateway("openai/gpt-oss-120b"),
    company: "openai",
    temperature: 0.6,
    reasoning: true,
  },
  "GPT OSS Mini": {
    model: providers.openrouter("openai/gpt-oss-20b"),
    reasoning: true,
    company: "openai",
    temperature: 0.6,
  },
  "o4 Mini": {
    model: providers.openai("o4-mini"),
    reasoning: true,
    company: "openai",
    temperature: 0.6,
  },
  o3: {
    model: providers.openai("o3"),
    reasoning: true,
    company: "openai",
    temperature: 0.6,
  },
  "GPT 5 Nano": {
    model: providers.openai("gpt-5-nano-2025-08-07"),
    company: "openai",
    temperature: 0.6,
    providerOptions: {
      openai: {
        textVerbosity: "low",
        serviceTier: "priority",
      },
    },
  },
  "GPT 5.4 Mini": {
    model: providers.openai("gpt-5.4-mini-2026-03-17"),
    reasoning: true,
    company: "openai",
    providerOptions: {
      openai: {
        textVerbosity: "low",
        reasoningEffort: "high",
        reasoningSummary: "auto",
      },
    },
    supportedFiles: ["img", "pdf"],
  },
  "GPT 5.4": {
    model: providers.openai("gpt-5.4-2026-03-05"),
    reasoning: true,
    company: "openai",
    providerOptions: {
      openai: {
        textVerbosity: "low",
        reasoningEffort: "high",
        reasoningSummary: "auto",
      },
    },
    supportedFiles: ["img", "pdf"],
  },
} as const satisfies Record<string, ModelConfiguration>;
