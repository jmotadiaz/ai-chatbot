import { ChatAgentAiPort } from "@/lib/features/chat/conversation/ports";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";

export const chatAiAdapter = (modelId: chatModelId): ChatAgentAiPort => ({
  getModelConfiguration: () => inferenceKit.languageModel(modelId),
  createAgent: (options) => inferenceKit.createAgent(modelId, options),
});
