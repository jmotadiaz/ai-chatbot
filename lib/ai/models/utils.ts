import {
  chatModelConfigurations,
  chatModelId,
  defaultModel,
  defaultTemperature,
  defaultTopK,
  defaultTopP,
  languageModelConfigurations,
  ModelConfiguration,
} from "@/lib/ai/models/definition";
import { defaultSystemPrompt } from "@/lib/ai/prompts";
import { ChatbotMessage } from "@/lib/ai/types";
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
    return autoModel(messages);
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

export const getChatConfigurationByModelId = (
  modelId: chatModelId
): Required<Omit<ModelConfiguration, "model" | "providerOptions">> => {
  const {
    temperature,
    topK,
    topP,
    systemPrompt,
    disabledConfig,
    supportedFiles,
  } = Object.assign(
    {
      temperature: defaultTemperature,
      topP: defaultTopP,
      topK: defaultTopK,
      systemPrompt: defaultSystemPrompt,
      disabledConfig: [],
      supportedFiles: [],
    },
    modelId !== "Auto Model Workflow" ? chatModelConfigurations[modelId] : {}
  );

  return {
    temperature,
    topK,
    topP,
    systemPrompt,
    disabledConfig,
    supportedFiles,
  };
};
