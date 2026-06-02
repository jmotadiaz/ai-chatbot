import "server-only";

import { generateText } from "ai";
import type { CompactionAiPort } from "../ports";
import { languageModelConfigurations } from "@/lib/features/foundation-model/config";
import type { chatModelId } from "@/lib/features/foundation-model/config";

export const compactionAiAdapter: CompactionAiPort = {
  generateText: async (modelKey, system, prompt) => {
    const { text } = await generateText({
      ...languageModelConfigurations(modelKey as chatModelId),
      system,
      prompt,
      temperature: 0.1,
    });
    return text;
  },
};
