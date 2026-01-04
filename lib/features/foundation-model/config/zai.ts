import { wrapLanguageModel } from "ai";
import { providers } from "@/lib/infrastructure/ai/providers";
import type { ModelConfiguration } from "../types";
import { reasoningMw } from "./utils";

export const ZAI_CONFIG = {
  "GLM-4.6": {
    model: wrapLanguageModel({
      model: providers.gateway("zai/glm-4.6"),
      middleware: [reasoningMw],
    }),
    reasoning: true,
    company: "zai",
    temperature: 1,
    topP: 0.9,
    topK: 40,
    providerOptions: {
      gateway: {
        zeroDataRetention: true,
        order: ["deepinfra", "baseten"],
        only: ["deepinfra", "baseten"],
      },
    },
  },
} as const satisfies Record<string, ModelConfiguration>;
