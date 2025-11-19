import type {
  chatModelId,
  ModelConfiguration,
} from "@/lib/ai/models/definition";
import {
  chatModelKeys,
  defaultTemperature,
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
  tools,
}: {
  selectedModel: chatModelId;
  messages: ChatbotMessage[];
  temperature?: number;
  tools: Tools;
}): Promise<{
  modelConfiguration: ModelConfiguration;
  autoModelMetadata?: ModelRoutingMetadata;
  tools: Tools;
}> => {
  if (selectedModel === "Router") {
    return modelRouting({ messages, tools });
  }
  const modelConfig: ModelConfiguration =
    languageModelConfigurations(selectedModel) ||
    languageModelConfigurations(chatModelKeys[0]);
  return {
    modelConfiguration: {
      ...modelConfig,
      // If a temperature override is provided, use it; otherwise keep modelConfig.temperature
      temperature: temperature ?? modelConfig.temperature,
    },
    tools,
  };
};

export const getChatConfigurationByModelId = (
  modelId: chatModelId
): Required<
  Omit<ModelConfiguration, "model" | "providerOptions" | "topP" | "topK">
> => {
  const {
    temperature,
    systemPrompt,
    toolCalling,
    supportedFiles,
    supportedOutput,
    company,
    nativeToolCalling,
    reasoning,
  } = Object.assign(
    {
      temperature: defaultTemperature,
      systemPrompt: defaultSystemPrompt,
      toolCalling: true,
      nativeToolCalling: false,
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
    systemPrompt,
    toolCalling,
    nativeToolCalling,
    supportedFiles,
    supportedOutput,
  };
};
