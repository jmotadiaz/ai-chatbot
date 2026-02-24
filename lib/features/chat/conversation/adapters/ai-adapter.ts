import { ChatAiPort } from "@/lib/features/chat/conversation/ports";
import {
  languageModelConfigurations,
  chatModelKeys,
  chatModelId,
} from "@/lib/features/foundation-model/config";

export const chatAiAdapter: ChatAiPort = {
  getModelConfiguration: (modelId: chatModelId) => {
    return (
      languageModelConfigurations(modelId as Exclude<chatModelId, "Router">) ||
      languageModelConfigurations(chatModelKeys[0])
    );
  },
};
