import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const OPENAI_CONFIG = {
  "GPT OSS": {
    model: providers.gateway("openai/gpt-oss-120b"),
    company: "openai",
    temperature: 0.6,
    reasoning: true,
    providerOptions: {
      openai: { reasoningEffort: "high" },
      gateway: {
        zeroDataRetention: true,
        order: ["cerebras", "baseten"],
        only: ["cerebras", "baseten"],
      },
    },
  },
  "GPT OSS Mini": {
    model: providers.gateway("openai/gpt-oss-20b"),
    reasoning: true,
    company: "openai",
    temperature: 0.6,
    providerOptions: {
      gateway: {
        zeroDataRetention: true,
      },
    },
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
  "GPT 5 Mini": {
    model: providers.openai("gpt-5-mini-2025-08-07"),
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
  "GPT 5.2": {
    model: providers.openai("gpt-5.2"),
    reasoning: true,
    company: "openai",
    providerOptions: {
      openai: {
        textVerbosity: "low",
        reasoningEffort: "xhigh",
        reasoningSummary: "auto",
        serviceTier: "priority",
      },
    },
    supportedFiles: ["img", "pdf"],
  },
} as const satisfies Record<string, ModelConfiguration>;
