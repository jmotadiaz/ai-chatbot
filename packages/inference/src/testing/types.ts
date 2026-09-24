import type { LanguageModelV3 } from "@ai-sdk/provider";

export interface MockCapabilities {
  multimodal?: boolean;
  toolExecution?: boolean;
  thinkingBlocks?: boolean;
  errorScenarios?: Array<"refusal" | "mid_stream_error">;
}

/**
 * A behaviour a test composition can select. This type carries no model id
 * of its own — binding a behaviour to a real catalog id is a consumer
 * concern (e.g. the chatbot's capability-alias table in its own tests).
 */
export interface MockModelEntry {
  capabilities: MockCapabilities;
  languageModel: LanguageModelV3;
}
