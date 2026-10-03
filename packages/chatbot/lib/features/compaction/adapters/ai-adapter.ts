import "server-only";

import { generateText } from "ai";
import type { LanguageModelRole, ModelId } from "models";
import type { CompactionAiPort } from "../ports";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";

export const compactionAiAdapter: CompactionAiPort = {
  // `modelKey` is `CompactionAiPort`'s opaque string (the feature owns which
  // string it passes, today one of the two compaction Model Roles); cast to
  // what `inferenceKit.languageModel` actually accepts.
  generateText: async (modelKey, system, prompt) => {
    const { text } = await generateText({
      ...inferenceKit.languageModel(modelKey as ModelId | LanguageModelRole),
      system,
      prompt,
      temperature: 0.1,
    });
    return text;
  },
};
