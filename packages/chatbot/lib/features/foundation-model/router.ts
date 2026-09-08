import {
  type chatModelId,
  chatModelKeys,
} from "./config";
import { languageModelConfigurations } from "./server";
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
  _modelRoutingArgs: ModelRoutingArguments
): Promise<ModelRoutingResult> {
  throw new Error(
    "modelRouting has been deprecated and should not be invoked directly."
  );
}

export function autoModelEvaluation(
  selectedModel: chatModelId,
  _messages: ChatbotMessage[],
  tools: Tools = []
): { modelConfiguration: ModelConfiguration; autoModelMetadata: ModelRoutingMetadata; tools: Tools } {
  const modelConfiguration =
    languageModelConfigurations(selectedModel) ||
    languageModelConfigurations(chatModelKeys[0]);

  const autoModelMetadata: ModelRoutingMetadata = {
    category: "conversational",
    complexity: "simple",
    model: selectedModel,
  };

  return {
    modelConfiguration,
    autoModelMetadata,
    tools,
  };
}
