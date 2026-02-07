import {
  chatModelId,
  chatModelKeys,
  languageModelConfigurations,
} from "./config";
import type {
  ModelConfiguration,
  ModelRoutingArguments,
  ModelRoutingMetadata,
  ModelRoutingResult,
} from "./types";
import type { Tools, ChatbotMessage } from "@/lib/features/chat/types";

// --- Model Routing Logic ---

// THIS FILE IS DEPRECATED AND NO LONGER USED IN THE APPLICATION LOGIC.
// IT IS KEPT FOR REFERENCE ONLY AS PER INSTRUCTIONS.

export async function modelRouting(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _args: ModelRoutingArguments,
): Promise<ModelRoutingResult> {
  // Deprecated implementation that throws error if called
  throw new Error("modelRouting is deprecated and should not be used.");
}

// --- Configuration Calculation Helpers ---

export const calculateModelConfiguration = async ({
  selectedModel,
  temperature,
  topP,
  topK,
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
    // Falback or error, since router is deprecated
    throw new Error("Router model is deprecated.");
  }
  const modelConfig: ModelConfiguration =
    languageModelConfigurations(selectedModel) ||
    languageModelConfigurations(chatModelKeys[0]);
  return {
    modelConfiguration: {
      ...modelConfig,
      // If overrides are provided, use them; otherwise keep modelConfig values
      temperature: temperature ?? modelConfig.temperature,
      topP: topP ?? modelConfig.topP,
      topK: topK ?? modelConfig.topK,
    },
    tools,
  };
};
