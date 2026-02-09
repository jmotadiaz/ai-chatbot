import { Context7Agent } from "@upstash/context7-tools-ai-sdk";
import {
  languageModelConfigurations,
  type chatModelId,
} from "@/lib/features/foundation-model/config";

export const createContext7Agent = (modelId: chatModelId) => {
  if (modelId === "Router") {
    throw new Error("Router model is not supported for Context7 Agent");
  }

  return new Context7Agent({
    ...languageModelConfigurations(modelId),
  });
};
