import {
  chatModelId,
  LANGUAGE_MODEL_CONFIGURATIONS_CONST,
  LanguageModelKeys,
} from "@/lib/features/foundation-model/config";
import {
  ModelConfiguration,
  ProviderOptions,
} from "@/lib/features/foundation-model/types";

export const languageModelConfigurations = (
  modelKey: LanguageModelKeys,
  { providerOptions }: { providerOptions?: ProviderOptions } = {}
): ModelConfiguration => {
  const baseConfig: ModelConfiguration =
    LANGUAGE_MODEL_CONFIGURATIONS_CONST[modelKey];
  return {
    ...baseConfig,
    ...(providerOptions && { providerOptions: { ...providerOptions } }),
  };
};

export interface ChatModelConfiguration {
  company: ModelConfiguration["company"];
  temperature?: number;
  topP?: number;
  topK?: number;
  reasoning: boolean;
  toolCalling: boolean;
  nativeToolCalling: boolean;
  zeroDataRetention?: boolean;
  supportedFiles: Required<ModelConfiguration>["supportedFiles"];
  supportedOutput: Required<ModelConfiguration>["supportedOutput"];
}

export const getChatConfigurationByModelId = (
  modelId: chatModelId
): ChatModelConfiguration => {
  const defaultConfig = {
    toolCalling: true,
    nativeToolCalling: false,
    company: "ai chatbot" as const,
    supportedFiles: [] as Required<ModelConfiguration>["supportedFiles"],
    reasoning: false,
    zeroDataRetention: false,
    supportedOutput: ["text"] as Required<ModelConfiguration>["supportedOutput"],
  };

  if (modelId === "Router") {
    return {
      ...defaultConfig,
      reasoning: true,
      supportedFiles: ["img", "pdf"],
      supportedOutput: ["text", "img"],
    };
  }

  const modelConfig = languageModelConfigurations(modelId);

  return {
    company: modelConfig.company,
    temperature: modelConfig.temperature,
    topP: modelConfig.topP,
    topK: modelConfig.topK,
    reasoning: modelConfig.reasoning ?? false,
    toolCalling: modelConfig.toolCalling ?? true,
    nativeToolCalling: modelConfig.nativeToolCalling ?? false,
    zeroDataRetention: modelConfig.providerOptions?.gateway?.zeroDataRetention,
    supportedFiles: modelConfig.supportedFiles ?? [],
    supportedOutput: modelConfig.supportedOutput ?? ["text"],
  };
};
