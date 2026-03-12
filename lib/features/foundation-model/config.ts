import deepmerge from "deepmerge";
import type { ModelConfiguration, ProviderOptions } from "./types";

import { ALIBABA_CONFIG } from "./alibaba";
import { ANTHROPIC_CONFIG } from "./anthropic";
import { DEEPSEEK_CONFIG } from "./deepseek";
import { GOOGLE_CONFIG } from "./google";
import { META_CONFIG } from "./meta";
import { MINIMAX_CONFIG } from "./minimax";
import { MISTRAL_CONFIG } from "./mistral";
import { MOONSHOTAI_CONFIG } from "./moonshotai";
import { OPENAI_CONFIG } from "./openai";
import { PERPLEXITY_CONFIG } from "./perplexity";
import { XAI_CONFIG } from "./xai";
import { XIAOMI_CONFIG } from "./xiaomi";
import { ZAI_CONFIG } from "./zai";
import { STEPFUN_CONFIG } from "./stepfun";

export const LANGUAGE_MODEL_CONFIGURATIONS_CONST = {
  ...STEPFUN_CONFIG,
  ...META_CONFIG,
  ...MOONSHOTAI_CONFIG,
  ...MISTRAL_CONFIG,
  ...DEEPSEEK_CONFIG,
  ...ALIBABA_CONFIG,
  ...MINIMAX_CONFIG,
  ...XIAOMI_CONFIG,
  ...ZAI_CONFIG,
  ...PERPLEXITY_CONFIG,
  ...ANTHROPIC_CONFIG,
  ...OPENAI_CONFIG,
  ...GOOGLE_CONFIG,
  ...XAI_CONFIG,
} as const satisfies Record<string, ModelConfiguration>;

export type LanguageModelKeys =
  keyof typeof LANGUAGE_MODEL_CONFIGURATIONS_CONST;

export const chatModelKeys = [
  "StepFun 3.5",
  "Qwen 3.5 Flash",
  "Qwen 3.5 Plus",
  "GLM-4.7 Flash",
  "GLM-5",
  "Kimi K2",
  "Kimi K2.5",
  "MiMo V2 Flash",
  "MiniMax M2.1",
  "MiniMax M2.5",
  "Deepseek Chat",
  "Deepseek Reasoner",
  "Claude Haiku 4.5",
  "Claude Sonnet 4.6",
  "Claude Opus 4.5",
  "Grok 4.1 Fast",
  "Grok 4",
  "GPT OSS",
  "GPT 5.2",
  "Gemini 3 Flash",
  "Gemini 3.1 Pro",
] satisfies LanguageModelKeys[];

export type chatModelId = (typeof chatModelKeys)[number];

export const CHAT_MODELS: chatModelId[] = [...chatModelKeys];

// Constants
export const defaultModel: chatModelId = chatModelKeys[0];

export const defaultWebSearchNumResults = 4;
export const defaultRagMaxResources = 4;
export const defaultMinRagScore = 0.5;

// Helpers
export const languageModelConfigurations = (
  modelKey: LanguageModelKeys,
  { providerOptions }: { providerOptions?: ProviderOptions } = {},
): ModelConfiguration => {
  const baseConfig: ModelConfiguration =
    LANGUAGE_MODEL_CONFIGURATIONS_CONST[modelKey];

  if (providerOptions && baseConfig.providerOptions) {
    return {
      ...baseConfig,
      providerOptions: deepmerge(baseConfig.providerOptions, providerOptions),
    };
  }

  return {
    ...baseConfig,
    ...(providerOptions && { providerOptions }),
  };
};

export interface ChatModelConfiguration {
  company: ModelConfiguration["company"];
  temperature?: number;
  topP?: number;
  topK?: number;
  reasoning: boolean;
  zeroDataRetention?: boolean;
  supportedFiles: Required<ModelConfiguration>["supportedFiles"];
  supportedOutput: Required<ModelConfiguration>["supportedOutput"];
}

export const getChatConfigurationByModelId = (
  modelId: chatModelId,
): ChatModelConfiguration => {
  const modelConfig = languageModelConfigurations(modelId);

  return {
    company: modelConfig.company,
    temperature: modelConfig.temperature,
    topP: modelConfig.topP,
    topK: modelConfig.topK,
    reasoning: modelConfig.reasoning ?? false,
    zeroDataRetention: modelConfig.providerOptions?.gateway?.zeroDataRetention,
    supportedFiles: modelConfig.supportedFiles ?? [],
    supportedOutput: modelConfig.supportedOutput ?? ["text"],
  };
};
