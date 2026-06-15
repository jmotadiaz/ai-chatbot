import { ChatAgentAiPort } from "@/lib/features/chat/conversation/ports";
import {
  languageModelConfigurations,
  chatModelKeys,
  chatModelId,
} from "@/lib/features/foundation-model/config";

export const chatAiAdapter = (modelId: chatModelId): ChatAgentAiPort => {
  const getConfig = () =>
    languageModelConfigurations(modelId) ||
    languageModelConfigurations(chatModelKeys[0]);

  return {
    getRagModelConfiguration: getConfig,
    getWebSearchModelConfiguration: getConfig,
    getContext7ModelConfiguration: getConfig,
    getProjectModelConfiguration: getConfig,
  };
};
