import {
  chatModelId,
  defaultModel,
  languageModelConfigurations,
  ModelConfiguration,
} from "@/lib/ai/models/definition";
import { ChatbotMessage } from "@/lib/ai/types";
import { messagePartsToText } from "@/lib/ai/utils";
import { autoModel, AutoModelMetadata } from "@/lib/ai/workflows/auto-model";

export const calculateModelConfiguration = async (
  selectedModel: chatModelId,
  messages: ChatbotMessage[],
  temperature?: number,
  topP?: number,
  topK?: number
): Promise<{
  modelConfiguration: ModelConfiguration;
  autoModelMetadata?: AutoModelMetadata;
}> => {
  if (selectedModel === "Auto Model Workflow") {
    const firstMessage = messages[0];
    return autoModel(firstMessage ? messagePartsToText(firstMessage) : "");
  } else {
    const modelConfig: ModelConfiguration =
      languageModelConfigurations[selectedModel] ||
      languageModelConfigurations[
        defaultModel as keyof typeof languageModelConfigurations
      ];
    return {
      modelConfiguration: {
        ...modelConfig,
        temperature: modelConfig.disabledConfig?.includes("temperature")
          ? undefined
          : temperature,
        topP: modelConfig.disabledConfig?.includes("topP") ? undefined : topP,
        topK: modelConfig.disabledConfig?.includes("topK") ? undefined : topK,
      },
    };
  }
};
