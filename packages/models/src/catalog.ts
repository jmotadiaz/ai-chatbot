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
  | "metaModelApi"
  | "gateway"
  | "openrouter"
  | "openai"
  | "xai"
  | "groq"
  | "perplexity"
  | "lmstudio";

/** Price per million tokens, in the same units Pi uses. */
export interface ModelCost {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

/**
 * Model-level thinking controls, keyed by Pi thinking level. A string value
 * is what gets sent to the provider for that level; null marks the level as
 * unsupported (hidden/clamped away).
 */
export type ThinkingLevelMap = Partial<Record<ThinkingLevel, string | null>>;

export interface ModelCatalogEntry {
  id: string;
  userInvocable: boolean;
  provider: { kind: ProviderKind; modelId: string };
  company: Company;
  reasoning?: boolean;
  /**
   * Nivel de razonamiento aplicado por defecto al crear una sesión de coding
   * agent (o al cambiar de modelo). Pi lo clampea a lo que el modelo soporta.
   */
  defaultThinkingLevel?: ThinkingLevel;
  /**
   * Optional override of the levels a model supports and their provider
   * mapping. When omitted, the generated models.json inherits Pi's built-in
   * thinkingLevelMap (e.g. deepseek-v4-pro only supports off/high/xhigh).
   */
  thinkingLevelMap?: ThinkingLevelMap;
  temperature?: number;
  topP?: number;
  topK?: number;
  /**
   * Only needed when the model is unknown to Pi. For models Pi already ships,
   * these are inherited from its built-in definition — see generateModelsJson.
   */
  contextWindow?: number;
  maxTokens?: number;
  cost?: ModelCost;
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
    defaultThinkingLevel: "xhigh",
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
    defaultThinkingLevel: "xhigh",
    temperature: 1,
    topP: 0.95,
  },
  {
    id: "Kimi K2.7 Code",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "kimi-k2.7-code" },
    company: "moonshotai",
    reasoning: true,
    defaultThinkingLevel: "high",
    supportedFiles: ["img"],
  },
  {
    // Invocable models Pi does not ship must describe their own limits and
    // cost — values taken from the opencode-go registry.
    id: "Kimi K3",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "kimi-k3" },
    company: "moonshotai",
    reasoning: true,
    defaultThinkingLevel: "high",
    supportedFiles: ["img"],
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 0 },
  },
  {
    id: "MiniMax M3",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "minimax-m3" },
    company: "minimax",
    reasoning: true,
    defaultThinkingLevel: "high",
    supportedFiles: ["img"],
    temperature: 1,
    topP: 0.95,
  },
  {
    id: "Qwen 3.7 Plus",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "qwen3.7-plus" },
    company: "alibaba",
    reasoning: true,
    defaultThinkingLevel: "high",
    supportedFiles: ["img"],
  },
  {
    // Pi does not ship this model, so it describes its own limits and cost —
    // taken from the opencode-go registry.
    id: "Qwen 3.8 Max",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "qwen3.8-max" },
    company: "alibaba",
    reasoning: true,
    defaultThinkingLevel: "high",
    contextWindow: 1_000_000,
    maxTokens: 65_536,
    cost: { input: 2.5, output: 7.5, cacheRead: 0.5, cacheWrite: 3.125 },
  },
  {
    id: "MiMo V2.5",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "mimo-v2.5" },
    company: "xiaomi",
    reasoning: true,
    defaultThinkingLevel: "high",
    supportedFiles: ["img"],
    temperature: 0.6,
    topP: 0.95,
  },
  {
    id: "MiMo V2.5 Pro",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "mimo-v2.5-pro" },
    company: "xiaomi",
    reasoning: true,
    defaultThinkingLevel: "high",
    temperature: 0.6,
    topP: 0.95,
  },
  {
    id: "Muse Spark 1.2",
    userInvocable: true,
    provider: { kind: "metaModelApi", modelId: "muse-spark-1.2" },
    company: "meta",
    reasoning: true,
    defaultThinkingLevel: "xhigh",
    thinkingLevelMap: {
      off: null,
      minimal: "minimal",
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
    },
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    cost: { input: 0.1, output: 0.2, cacheRead: 0.002, cacheWrite: 0.002 },
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
    provider: { kind: "perplexity", modelId: "sonar-pro" },
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

export function getDefaultThinkingLevel(
  modelId: InvocableModelId,
): ThinkingLevel | undefined {
  return MODEL_CATALOG.find(
    (e): e is Extract<(typeof MODEL_CATALOG)[number], { userInvocable: true }> =>
      e.userInvocable && e.id === modelId,
  )?.defaultThinkingLevel;
}

export const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return typeof value === "string" && (THINKING_LEVELS as string[]).includes(value);
}

/** Misma semántica que pi-ai: niveles soportados según reasoning + thinkingLevelMap. */
export function getSupportedThinkingLevels(
  reasoning: boolean | undefined,
  thinkingLevelMap: ThinkingLevelMap | undefined,
): ThinkingLevel[] {
  if (!reasoning) return ["off"];
  return THINKING_LEVELS.filter((level) => {
    const mapped = thinkingLevelMap?.[level];
    if (mapped === null) return false;
    if (level === "xhigh") return mapped !== undefined;
    return true;
  });
}
