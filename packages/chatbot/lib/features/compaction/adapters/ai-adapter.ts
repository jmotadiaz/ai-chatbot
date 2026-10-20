import "server-only";

import { generateText } from "ai";
import type { CompactionAiPort } from "../ports";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";

export const compactionAiAdapter: CompactionAiPort = {
  // `modelKey` is `CompactionAiPort`'s opaque string — today one of the two
  // Default Model Contracts (`reasoning-default` / `vision-default`, see
  // `summary-generation.ts`).
  generateText: async (modelKey, system, prompt) => {
    const { text } = await generateText({
      ...inferenceKit.languageModel(modelKey),
      system,
      prompt,
      temperature: 0.1,
    });
    return text;
  },
};
