import type { LanguageModelV3 } from "@ai-sdk/provider";

export interface MockCapabilities {
  multimodal?: boolean;
  toolExecution?: boolean;
  thinkingBlocks?: boolean;
  streamDelays?: boolean;
  errorScenarios?: Array<"refusal" | "rate_limit" | "timeout" | "mid_stream_error">;
}

export interface MockModelEntry {
  id: string;
  displayName: string;
  capabilities: MockCapabilities;
  languageModel: LanguageModelV3;
}
