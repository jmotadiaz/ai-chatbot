import {
  chatModelConfigurations,
  chatModelId,
  chatModelKeys,
  defaultTemperature,
  defaultTopK,
  defaultTopP,
  languageModelConfigurations,
  ModelConfiguration,
} from "@/lib/ai/models/definition";
import { defaultSystemPrompt } from "@/lib/ai/prompts";
import { Tools } from "@/lib/ai/tools/types";
import { ChatbotMessage } from "@/lib/ai/types";
import {
  modelRouting,
  ModelRoutingMetadata,
} from "@/lib/ai/workflows/model-routing";

export const calculateModelConfiguration = async ({
  selectedModel,
  messages,
  temperature,
  topK,
  topP,
  tools,
}: {
  selectedModel: chatModelId;
  messages: ChatbotMessage[];
  temperature?: number;
  topP?: number;
  topK?: number;
  tools: Tools;
}): Promise<{
  modelConfiguration: ModelConfiguration;
  autoModelMetadata?: ModelRoutingMetadata;
  tools: Tools;
}> => {
  if (selectedModel === "Router") {
    return modelRouting({ messages, tools });
  } else {
    const modelConfig: ModelConfiguration =
      languageModelConfigurations[selectedModel] ||
      languageModelConfigurations[chatModelKeys[0]];
    return {
      modelConfiguration: {
        ...modelConfig,
        temperature: modelConfig.disabledConfig?.includes("temperature")
          ? undefined
          : temperature,
        topP: modelConfig.disabledConfig?.includes("topP") ? undefined : topP,
        topK: modelConfig.disabledConfig?.includes("topK") ? undefined : topK,
      },
      tools,
    };
  }
};

export const getChatConfigurationByModelId = (
  modelId: chatModelId
): Required<
  Omit<ModelConfiguration, "model" | "providerOptions" | "company">
> => {
  const {
    temperature,
    topK,
    topP,
    systemPrompt,
    disabledConfig,
    disabledTools,
    supportedFiles,
  } = Object.assign(
    {
      temperature: defaultTemperature,
      topP: defaultTopP,
      topK: defaultTopK,
      systemPrompt: defaultSystemPrompt,
      disabledConfig: [],
      disabledTools: [],
      supportedFiles: [
        "img",
        "pdf",
      ] as Required<ModelConfiguration>["supportedFiles"],
    },
    modelId !== "Router" ? chatModelConfigurations[modelId] : {}
  );

  return {
    temperature,
    topK,
    topP,
    systemPrompt,
    disabledConfig,
    disabledTools,
    supportedFiles,
  };
};
