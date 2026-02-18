import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const GOOGLE_CONFIG = {
  "Gemini 2.5 Flash Lite": {
    model: providers.google("gemini-2.5-flash-lite"),
    company: "google",
    temperature: 0.6,
    supportedFiles: ["img", "pdf"],
    providerOptions: {
      gateway: {
        zeroDataRetention: true,
      },
    },
  },
  "Gemini 2.5 Flash": {
    model: providers.google("gemini-2.5-flash"),
    company: "google",
    temperature: 0.6,
    supportedFiles: ["img", "pdf"],
    reasoning: true,
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingBudget: 0,
          includeThoughts: false,
        },
      },
    },
  },
  "Gemini 3 Flash": {
    model: providers.gateway("google/gemini-3-flash"),
    company: "google",
    temperature: 1,
    supportedFiles: ["img", "pdf"],
    reasoning: true,
    providerOptions: {
      gateway: {
        zeroDataRetention: true,
      },
      google: {
        thinkingConfig: {
          includeThoughts: true,
        },
      },
    },
  },
  "Gemini 3 Flash Tools": {
    model: providers.google("gemini-3-flash-preview"),
    company: "google",
    temperature: 1,
    reasoning: true,
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingLevel: "low",
          includeThoughts: false,
        },
      },
    },
  },
  "Gemini 3 Pro": {
    model: providers.gateway("google/gemini-3-pro-preview"),
    company: "google",
    supportedFiles: ["img", "pdf"],
    reasoning: true,
    providerOptions: {
      gateway: {
        zeroDataRetention: true,
      },
      google: {
        thinkingConfig: {
          includeThoughts: true,
        },
      },
    },
  },
  "Nano Banana": {
    model: providers.gateway("google/gemini-2.5-flash-image"),
    company: "google",
    temperature: 0.6,
    supportedFiles: ["img", "pdf"],
    supportedOutput: ["text", "img"],
    providerOptions: {
      gateway: {
        zeroDataRetention: true,
      },
      google: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    },
  },
} as const satisfies Record<string, ModelConfiguration>;
