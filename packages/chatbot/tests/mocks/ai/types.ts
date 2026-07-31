import type { LanguageModelV3 } from "@ai-sdk/provider";

export interface MockCapabilities {
  multimodal?: boolean;
  toolExecution?: boolean;
  thinkingBlocks?: boolean;
  streamDelays?: boolean;
  errorScenarios?: Array<"refusal" | "rate_limit" | "timeout" | "mid_stream_error">;
}

/**
 * A behaviour the e2e suite can select. The model it is bound to lives in
 * CAPABILITY_ALIASES, not here.
 */
export interface MockModelEntry {
  capabilities: MockCapabilities;
  languageModel: LanguageModelV3;
}
