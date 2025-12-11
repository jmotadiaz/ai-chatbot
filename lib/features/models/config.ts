import { defaultSystemPrompt } from "@/lib/ai/prompts";
import {
  chatModelId,
  defaultTemperature,
  LANGUAGE_MODEL_CONFIGURATIONS_CONST,
  LanguageModelKeys,
} from "./constants";
import type { ModelConfiguration, ProviderOptions } from "./types";

// --- Helpers ---

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
