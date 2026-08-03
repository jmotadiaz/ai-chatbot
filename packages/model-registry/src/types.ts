export type Company =
  | "meta"
  | "openai"
  | "anthropic"
  | "google"
  | "xai"
  | "mistral"
  | "deepseek"
  | "perplexity"
  | "alibaba"
  | "moonshotai"
  | "minimax"
  | "nvidia"
  | "xiaomi"
  | "zai"
  | "stepfun"
  | "ai chatbot";

export interface ModelMetadata {
  company: Company;
  temperature?: number;
  topP?: number;
  topK?: number;
  contextWindow?: number;
  reasoning?: boolean;
  supportedFiles?: ReadonlyArray<"pdf" | "img">;
  supportedOutput?: ReadonlyArray<"text" | "img">;
  providerOptions?: Record<string, unknown>;
}

export interface CodingAgentMapping {
  providerId: string;
  modelId: string;
}

export interface ModelDefinition {
  id: string;
  metadata: ModelMetadata;
  /** ai-sdk provider key used by the chatbot (e.g. "gateway", "openai", "openrouter"). */
  aiSdkProvider: string;
  /** Raw model id passed to the ai-sdk provider. */
  aiSdkModelId: string;
  /** Whether the model is exposed in the chat UI picker. */
  chatEnabled: boolean;
  /** If set, the model is also available in the coding agent via this mapping. */
  codingAgentMapping?: CodingAgentMapping;
}
