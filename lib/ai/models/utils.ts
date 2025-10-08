import type {
  chatModelId,
  ModelConfiguration,
} from "@/lib/ai/models/definition";
import {
  chatModelKeys,
  defaultTemperature,
  defaultTopK,
  defaultTopP,
  languageModelConfigurations,
} from "@/lib/ai/models/definition";
import { defaultSystemPrompt } from "@/lib/ai/prompts";
import type { Tools } from "@/lib/ai/tools/types";
import type { ChatbotMessage } from "@/lib/ai/types";
import type { ModelRoutingMetadata } from "@/lib/ai/workflows/model-routing";
import { modelRouting } from "@/lib/ai/workflows/model-routing";

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
      languageModelConfigurations(selectedModel) ||
      languageModelConfigurations(chatModelKeys[0]);
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
    reasoning,
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
      reasoning: false,
      supportedOutput: [
        "text",
      ] as Required<ModelConfiguration>["supportedOutput"],
    },
    modelId !== "Router"
      ? {
          ...languageModelConfigurations(modelId),
          ...(languageModelConfigurations(modelId) && {
            temperature: languageModelConfigurations(
              modelId
            ).disabledConfig?.includes("temperature")
              ? null
              : languageModelConfigurations(modelId).temperature ??
                defaultTemperature,
            topK: languageModelConfigurations(modelId).disabledConfig?.includes(
              "topK"
            )
              ? null
              : languageModelConfigurations(modelId).topK ?? defaultTopK,
            topP: languageModelConfigurations(modelId).disabledConfig?.includes(
              "topP"
            )
              ? null
              : languageModelConfigurations(modelId).topP ?? defaultTopP,
          }),
        }
      : {
          reasoning: true,
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
    reasoning,
    topK,
    topP,
    systemPrompt,
    disabledConfig,
    toolCalling,
    supportedFiles,
    supportedOutput,
  };
};
