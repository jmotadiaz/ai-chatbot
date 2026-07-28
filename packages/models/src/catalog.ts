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

export type ProviderKind =
  | "opencodeGo"
  | "gateway"
  | "openrouter"
  | "openai"
  | "xai"
  | "groq"
  | "perplexity"
  | "lmstudio";

export interface ModelCatalogEntry {
  id: string;
  userInvocable: boolean;
  provider: { kind: ProviderKind; modelId: string };
  company: Company;
  reasoning?: boolean;
  temperature?: number;
  topP?: number;
  topK?: number;
  contextWindow?: number;
  maxTokens?: number;
  supportedFiles?: readonly ("pdf" | "img")[];
  supportedOutput?: readonly ("text" | "img")[];
  providerOptions?: Readonly<Record<string, unknown>>;
  wrapWithReasoningMiddleware?: boolean;
}

export const MODEL_CATALOG = [
  // --- userInvocable (coding-agent + chat selectors) ---
  {
    id: "Deepseek v4 Flash",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "deepseek-v4-flash" },
    company: "deepseek",
    reasoning: true,
    temperature: 1,
    topP: 0.95,
    providerOptions: { gateway: { zeroDataRetention: true } },
  },
  {
    id: "Deepseek v4 Pro",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "deepseek-v4-pro" },
    company: "deepseek",
    reasoning: true,
    temperature: 1,
    topP: 0.95,
  },
  {
    id: "Kimi K2.6",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "kimi-k2.6" },
    company: "moonshotai",
    reasoning: true,
    supportedFiles: ["img", "pdf"],
    temperature: 1.0,
    topP: 0.95,
  },
  {
    id: "Qwen 3.6 Plus",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "qwen3.6-plus" },
    company: "alibaba",
    reasoning: true,
    supportedFiles: ["pdf", "img"],
  },
  {
    id: "MiMo V2.5",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "mimo-v2.5" },
    company: "xiaomi",
    reasoning: true,
    temperature: 0.6,
    topP: 0.95,
  },
  {
    id: "MiMo V2.5 Pro",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "mimo-v2.5-pro" },
    company: "xiaomi",
    reasoning: true,
    temperature: 0.6,
    topP: 0.95,
  },
  // --- internal / non-selectable models ---
  {
    id: "StepFun 3.5",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "stepfun/step-3.5-flash:free" },
    company: "stepfun",
  },
  {
    id: "Llama 3.1 Instant",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "meta-llama/llama-3.1-8b-instruct" },
    company: "meta",
    temperature: 0.6,
  },
  {
    id: "Llama 3.3",
    userInvocable: false,
    provider: { kind: "groq", modelId: "llama-3.3-70b-versatile" },
    company: "meta",
    temperature: 0.6,
  },
  {
    id: "Llama 4 Scout",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "meta-llama/llama-4-scout" },
    company: "meta",
    temperature: 0.6,
    supportedFiles: ["img"],
  },
  {
    id: "Llama 4 Maverick",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "meta-llama/llama-4-maverick" },
    company: "meta",
    temperature: 0.6,
    supportedFiles: ["img"],
  },
  {
    id: "Magistral Medium",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "mistralai/mistral-medium-3.1" },
    company: "mistral",
    temperature: 0.6,
  },
  {
    id: "Magistral Small",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "mistralai/mistral-small-3.2-24b-instruct" },
    company: "mistral",
    temperature: 0.6,
  },
  {
    id: "Qwen 3.5 Flash",
    userInvocable: false,
    provider: { kind: "gateway", modelId: "alibaba/qwen3.5-flash" },
    company: "alibaba",
    reasoning: true,
  },
  {
    id: "Qwen3 30b",
    userInvocable: false,
    provider: { kind: "lmstudio", modelId: "qwen/qwen3-30b-a3b-2507" },
    company: "alibaba",
    temperature: 0.6,
  },
  {
    id: "Qwen3 Coder",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "qwen/qwen3-coder" },
    company: "alibaba",
    temperature: 0.6,
  },
  {
    id: "MiniMax M2.7",
    userInvocable: false,
    provider: { kind: "gateway", modelId: "minimax/minimax-m2.7" },
    company: "minimax",
    reasoning: true,
    temperature: 1,
    topP: 0.9,
    providerOptions: { gateway: { zeroDataRetention: true } },
  },
  {
    id: "MiniMax M2.5",
    userInvocable: false,
    provider: { kind: "gateway", modelId: "minimax/minimax-m2.5" },
    company: "minimax",
    reasoning: true,
    temperature: 1,
    providerOptions: { gateway: { zeroDataRetention: true } },
  },
  {
    id: "GLM-4.7",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "z-ai/glm-4.7" },
    company: "zai",
    temperature: 0.6,
    topP: 0.95,
  },
  {
    id: "GLM-4.7 Flash",
    userInvocable: false,
    provider: { kind: "gateway", modelId: "zai/glm-4.7-flash" },
    company: "zai",
    reasoning: true,
    temperature: 0.6,
    topP: 0.95,
  },
  {
    id: "GLM-5.1",
    userInvocable: false,
    provider: { kind: "gateway", modelId: "zai/glm-5.1" },
    company: "zai",
    reasoning: true,
    temperature: 0.6,
    topP: 0.95,
  },
  {
    id: "Sonar",
    userInvocable: false,
    provider: { kind: "perplexity", modelId: "sonar" },
    company: "perplexity",
    temperature: 0.6,
    supportedFiles: ["img"],
  },
  {
    id: "Sonar Pro",
    userInvocable: false,
    provider: { kind: "perplexity", modelId: "sonar-pro" },
    company: "perplexity",
    temperature: 0.6,
    supportedFiles: ["img"],
  },
  {
    id: "Sonar Reasoning",
    userInvocable: false,
    provider: { kind: "perplexity", modelId: "sonar-reasoning" },
    company: "perplexity",
    reasoning: true,
    temperature: 0.6,
    supportedFiles: ["img"],
    wrapWithReasoningMiddleware: true,
  },
  {
    id: "Claude Haiku 4.5",
    userInvocable: false,
    provider: { kind: "gateway", modelId: "anthropic/claude-haiku-4.5" },
    company: "anthropic",
    supportedFiles: ["img", "pdf"],
    providerOptions: {
      anthropic: { sendReasoning: true, thinking: { type: "enabled", budgetTokens: 10000 } },
      gateway: { zeroDataRetention: true },
    },
  },
  {
    id: "Claude Sonnet 4.6",
    userInvocable: false,
    provider: { kind: "gateway", modelId: "anthropic/claude-sonnet-4.6" },
    company: "anthropic",
    supportedFiles: ["img", "pdf"],
    reasoning: true,
    providerOptions: {
      anthropic: { sendReasoning: true, thinking: { type: "enabled", budgetTokens: 10000 } },
      gateway: { zeroDataRetention: true },
    },
  },
  {
    id: "Claude Opus 4.5",
    userInvocable: false,
    provider: { kind: "gateway", modelId: "anthropic/claude-opus-4.5" },
    company: "anthropic",
    supportedFiles: ["img", "pdf"],
    reasoning: true,
    providerOptions: {
      anthropic: { sendReasoning: true, thinking: { type: "enabled", budgetTokens: 10000 } },
      gateway: { zeroDataRetention: true },
    },
  },
  {
    id: "GPT OSS",
    userInvocable: false,
    provider: { kind: "gateway", modelId: "openai/gpt-oss-120b" },
    company: "openai",
    temperature: 0.6,
    reasoning: true,
  },
  {
    id: "GPT OSS Mini",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "openai/gpt-oss-20b" },
    company: "openai",
    reasoning: true,
    temperature: 0.6,
  },
  {
    id: "o4 Mini",
    userInvocable: false,
    provider: { kind: "openai", modelId: "o4-mini" },
    company: "openai",
    reasoning: true,
    temperature: 0.6,
  },
  {
    id: "o3",
    userInvocable: false,
    provider: { kind: "openai", modelId: "o3" },
    company: "openai",
    reasoning: true,
    temperature: 0.6,
  },
  {
    id: "GPT 5 Nano",
    userInvocable: false,
    provider: { kind: "openai", modelId: "gpt-5-nano-2025-08-07" },
    company: "openai",
    temperature: 0.6,
    providerOptions: { openai: { textVerbosity: "low", serviceTier: "priority" } },
  },
  {
    id: "GPT 5.4 Mini",
    userInvocable: false,
    provider: { kind: "openai", modelId: "gpt-5.4-mini-2026-03-17" },
    company: "openai",
    reasoning: true,
    providerOptions: { openai: { textVerbosity: "low", reasoningEffort: "high", reasoningSummary: "auto" } },
    supportedFiles: ["img", "pdf"],
  },
  {
    id: "GPT 5.4",
    userInvocable: false,
    provider: { kind: "openai", modelId: "gpt-5.4-2026-03-05" },
    company: "openai",
    reasoning: true,
    providerOptions: { openai: { textVerbosity: "low", reasoningEffort: "high", reasoningSummary: "auto" } },
    supportedFiles: ["img", "pdf"],
  },
  {
    id: "Gemini 2.5 Flash Lite",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "google/gemini-2.5-flash-lite" },
    company: "google",
    temperature: 0.6,
    reasoning: true,
  },
  {
    id: "Gemini 2.5 Flash",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "google/gemini-2.5-flash" },
    company: "google",
    temperature: 0.6,
    reasoning: true,
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 0, includeThoughts: false } } },
  },
  {
    id: "Gemini 3 Flash",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "google/gemini-3-flash-preview" },
    company: "google",
    temperature: 0.6,
    reasoning: true,
    supportedFiles: ["img", "pdf"],
    providerOptions: { google: { thinkingConfig: { includeThoughts: true, thinkingLevel: "high" } } },
  },
  {
    id: "Gemini 3.1 Flash Lite",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "google/gemini-3.1-flash-lite-preview" },
    company: "google",
    temperature: 0.6,
  },
  {
    id: "Gemini 3.1 Pro",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "google/gemini-3.1-pro-preview" },
    company: "google",
    supportedFiles: ["img", "pdf"],
    temperature: 0.6,
    providerOptions: { google: { thinkingConfig: { thinkingLevel: "high" } } },
  },
  {
    id: "Nano Banana",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "google/gemini-2.5-flash-image" },
    company: "google",
    temperature: 0.6,
    supportedFiles: ["img"],
    supportedOutput: ["img"],
  },
  {
    id: "Grok Code Fast",
    userInvocable: false,
    provider: { kind: "xai", modelId: "grok-code-fast-1" },
    company: "xai",
    temperature: 0.6,
  },
  {
    id: "Grok 4.1 Fast",
    userInvocable: false,
    provider: { kind: "xai", modelId: "grok-4-1-fast" },
    company: "xai",
    temperature: 0.6,
    supportedFiles: ["img"],
    reasoning: true,
  },
  {
    id: "Grok 4.3",
    userInvocable: false,
    provider: { kind: "xai", modelId: "grok-4.3" },
    company: "xai",
    temperature: 0.6,
    supportedFiles: ["img"],
    reasoning: true,
  },
  {
    id: "Nemotron 3 Nano",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "nvidia/nemotron-3-nano-30b-a3b:free" },
    company: "nvidia",
    temperature: 0.6,
    topP: 0.95,
    reasoning: true,
    contextWindow: 64_000,
  },
  {
    id: "Nemotron 3 Super",
    userInvocable: false,
    provider: { kind: "openrouter", modelId: "nvidia/nemotron-3-super-120b-a12b:free" },
    company: "nvidia",
    temperature: 1,
    topP: 0.95,
    reasoning: true,
  },
] as const satisfies readonly ModelCatalogEntry[];

export type ModelId = (typeof MODEL_CATALOG)[number]["id"];

export type InvocableModelId = Extract<
  (typeof MODEL_CATALOG)[number],
  { userInvocable: true }
>["id"];

export const INVOCABLE_MODEL_IDS = MODEL_CATALOG.filter(
  (e): e is Extract<(typeof MODEL_CATALOG)[number], { userInvocable: true }> => e.userInvocable,
).map((e) => e.id);
