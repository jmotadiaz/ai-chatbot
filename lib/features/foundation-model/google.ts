import type { ModelConfiguration } from "./types";
import { providers } from "@/lib/infrastructure/ai/providers";

export const GOOGLE_CONFIG = {
  "Gemini 2.5 Flash Lite": {
    model: providers.openrouter("google/gemini-2.5-flash-lite"),
    company: "google",
    temperature: 0.6,
    reasoning: true,
  },
  "Gemini 2.5 Flash": {
    model: providers.openrouter("google/gemini-2.5-flash"),
    company: "google",
    temperature: 0.6,
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
    model: providers.openrouter("google/gemini-3-flash"),
    company: "google",
    temperature: 0.6,
    reasoning: true,
    supportedFiles: ["img", "pdf"],
    providerOptions: {
      google: {
        thinkingConfig: {
          includeThoughts: true,
        },
      },
    },
  },
  "Gemini 3.1 Flash Lite": {
    model: providers.openrouter("google/gemini-3.1-flash-lite-preview"),
    company: "google",
    temperature: 0.6,
  },
  "Gemini 3.1 Pro": {
    model: providers.openrouter("google/gemini-3.1-pro-preview"),
    company: "google",
    supportedFiles: ["img", "pdf"],
    temperature: 0.6,
  },
  "Nano Banana": {
    model: providers.openrouter("google/gemini-2.5-flash-image"),
    company: "google",
    temperature: 0.6,
    supportedFiles: ["img"],
    supportedOutput: ["img"],
  },
} as const satisfies Record<string, ModelConfiguration>;
