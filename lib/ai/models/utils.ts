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
): Required<Omit<ModelConfiguration, "model" | "providerOptions">> => {
  const {
    temperature,
    topK,
    topP,
    systemPrompt,
    disabledConfig,
    toolCalling,
    supportedFiles,
    supportedOutput,
    company,
  } = Object.assign(
    {
      temperature: defaultTemperature,
      topP: defaultTopP,
      topK: defaultTopK,
      systemPrompt: defaultSystemPrompt,
      disabledConfig: [],
      toolCalling: true,
      company: "ai chatbot" as const,
      supportedFiles: [],
      supportedOutput: [
        "text",
      ] as Required<ModelConfiguration>["supportedOutput"],
    },
    modelId !== "Router"
      ? {
          ...chatModelConfigurations[modelId],
          ...(chatModelConfigurations[modelId] && {
            temperature: chatModelConfigurations[
              modelId
            ].disabledConfig?.includes("temperature")
              ? null
              : chatModelConfigurations[modelId].temperature ??
                defaultTemperature,
            topK: chatModelConfigurations[modelId].disabledConfig?.includes(
              "topK"
            )
              ? null
              : chatModelConfigurations[modelId].topK ?? defaultTopK,
            topP: chatModelConfigurations[modelId].disabledConfig?.includes(
              "topP"
            )
              ? null
              : chatModelConfigurations[modelId].topP ?? defaultTopP,
          }),
        }
      : {
          supportedFiles: [
            "img",
            "pdf",
          ] as Required<ModelConfiguration>["supportedFiles"],
          supportedOutput: [
            "text",
            "img",
          ] as Required<ModelConfiguration>["supportedOutput"],
        }
  );

  return {
    company,
    temperature,
    topK,
    topP,
    systemPrompt,
    disabledConfig,
    toolCalling,
    supportedFiles,
    supportedOutput,
  };
};
