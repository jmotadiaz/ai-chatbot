import { ChatAgentAiPort } from "@/lib/features/chat/conversation/ports";
import {
  chatModelKeys,
  chatModelId,
} from "@/lib/features/foundation-model/config";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";

export const chatAiAdapter = (modelId: chatModelId): ChatAgentAiPort => {
  const getConfig = () =>
    inferenceKit.languageModel(modelId) ||
    inferenceKit.languageModel(chatModelKeys[0]);

  return {
    getRagModelConfiguration: getConfig,
    getWebSearchModelConfiguration: getConfig,
    getContext7ModelConfiguration: getConfig,
    getProjectModelConfiguration: getConfig,
    getNeutralModelConfiguration: getConfig,
  };
};
