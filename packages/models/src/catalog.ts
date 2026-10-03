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
  | "tencent"
  | "ai chatbot"
  | "ai-chatbot";

export type ProviderKind =
  | "opencodeGo"
  | "opencodeGoResponses"
  | "opencodeGoAnthropic"
  | "opencodeZen"
  | "gateway"
  | "openrouter"
  | "openai"
  | "xai"
  | "groq"
  | "perplexity"
  | "lmstudio"
  | "deepinfra";

/** Price per million tokens, in the same units Pi uses. */
export interface ModelCost {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** "max" es el nivel opt-in de Pi ≥ 0.80.6 (GPT-5.6, Claude adaptativos): solo se
 * expone si el catálogo lo mapea explícitamente para el modelo. */
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

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
  /**
   * Override Pi API for the model (e.g. force openai-completions for gateway
   * routing). Required (with baseUrl) for models Pi does not ship: without a
   * baseline, pi's ModelRegistry fills api/baseUrl from the provider's first
   * built-in model (opencode-go: deepseek-v4-flash, openai-completions), which
   * silently breaks models served over anthropic-messages (thinking/reasoning
   * streaming degrades to a plain text response).
   */
  api?: string;
  /** Required with `api` when Pi does not ship the model (opencode-go: https://opencode.ai/zen/go for anthropic-messages, /v1 for openai-completions). */
  baseUrl?: string;
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
    // Pi does not ship this model yet, so it describes its own limits, cost
    // and endpoint (openai-completions per the endpoints table at
    // https://opencode.ai/docs/es/go, model id "deepseek-v4.1-flash" per
    // https://opencode.ai/zen/go/v1/models). Pricing per
    // the usage table there (Off-Peak $0.15 in / $0.60 out / $0.003 cached
    // read per 1M tokens, no cached-write tier; Peak is double — most hours
    // are Off-Peak); limits mirror Pi's deepseek-v4-flash built-in (1M
    // context, 384k output — same per-request estimates as V4 Flash in the
    // Go docs). Thinking levels mirror that built-in too (low/high), plus
    // xhigh mapped to max so the catalog default resolves (same pattern as
    // the retired free variant).
    id: "Deepseek v4.1 Flash",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "deepseek-v4.1-flash" },
    company: "deepseek",
    reasoning: true,
    defaultThinkingLevel: "xhigh",
    thinkingLevelMap: {
      minimal: null,
      low: "low",
      medium: null,
      high: "high",
      xhigh: "max",
    },
    supportedFiles: ["img"],
    api: "openai-completions",
    baseUrl: "https://opencode.ai/zen/go/v1",
    temperature: 1,
    topP: 0.95,
    contextWindow: 1_000_000,
    maxTokens: 384_000,
    cost: { input: 0.15, output: 0.6, cacheRead: 0.003, cacheWrite: 0 },
    providerOptions: { gateway: { zeroDataRetention: true } },
  },
  {
    id: "Deepseek v4 Pro",
    userInvocable: false,
    provider: { kind: "opencodeGo", modelId: "deepseek-v4-pro" },
    company: "deepseek",
    reasoning: true,
    defaultThinkingLevel: "xhigh",
    temperature: 1,
    topP: 0.95,
  },
  {
    id: "Kimi K2.7 Code",
    userInvocable: false,
    provider: { kind: "opencodeGo", modelId: "kimi-k2.7-code" },
    company: "moonshotai",
    reasoning: true,
    defaultThinkingLevel: "high",
    supportedFiles: ["img"],
  },
  {
    // Invocable models Pi does not ship must describe their own limits,
    // cost and endpoint — values taken from the opencode-go registry and the
    // endpoints table at https://opencode.ai/docs/es/go.
    id: "Kimi K3",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "kimi-k3" },
    company: "moonshotai",
    reasoning: true,
    defaultThinkingLevel: "high",
    api: "openai-completions",
    baseUrl: "https://opencode.ai/zen/go/v1",
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
    // Pi does not ship this model, so it describes its own limits and cost —
    // taken from the opencode-go registry (mirrors qwen3.7-plus, the
    // flash/plus tier Pi does ship built-in there).
    //
    // api/baseUrl are pinned on purpose: Pi serves qwen3.7-plus/max over
    // anthropic-messages (https://opencode.ai/zen/go), but a model without a
    // built-in baseline inherits the provider default (deepseek-v4-flash,
    // openai-completions /zen/go/v1) — see buildModelDefinition.
    id: "Qwen 3.8 Flash",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "qwen3.8-flash" },
    company: "alibaba",
    reasoning: true,
    defaultThinkingLevel: "high",
    api: "anthropic-messages",
    baseUrl: "https://opencode.ai/zen/go",
    supportedFiles: ["img"],
    contextWindow: 1_000_000,
    maxTokens: 65_536,
    cost: { input: 0.4, output: 1.6, cacheRead: 0.04, cacheWrite: 0.5 },
  },
  {
    // Pi does not ship this model, so it describes its own limits and cost —
    // taken from the opencode-go registry.
    //
    // api/baseUrl are pinned on purpose: Pi serves qwen3.7-plus/max over
    // anthropic-messages (https://opencode.ai/zen/go), but a model without a
    // built-in baseline inherits the provider default (deepseek-v4-flash,
    // openai-completions /zen/go/v1) — see buildModelDefinition.
    id: "Qwen 3.8 Max",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "qwen3.8-max" },
    company: "alibaba",
    reasoning: true,
    defaultThinkingLevel: "high",
    api: "anthropic-messages",
    baseUrl: "https://opencode.ai/zen/go",
    contextWindow: 1_000_000,
    maxTokens: 65_536,
    cost: { input: 2.5, output: 7.5, cacheRead: 0.5, cacheWrite: 3.125 },
  },
  {
    // Pi does not ship this model, so it describes its own limits, cost and
    // endpoint (openai-completions per the endpoints table at
    // https://opencode.ai/docs/es/go). Context/output limits and
    // image/pdf input come from the opencode-go registry; pricing from the
    // usage table there ($0.14 in / $0.28 out / $0.0028 cached read per 1M
    // tokens, no cached-write tier).
    id: "MiMo V2.6 Flash",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "mimo-v2.6-flash" },
    company: "xiaomi",
    reasoning: true,
    defaultThinkingLevel: "high",
    api: "openai-completions",
    baseUrl: "https://opencode.ai/zen/go/v1",
    supportedFiles: ["img", "pdf"],
    temperature: 0.6,
    topP: 0.95,
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    cost: { input: 0.14, output: 0.28, cacheRead: 0.0028, cacheWrite: 0 },
  },
  {
    // Same as Flash, but ~3x the token price (usage table at
    // https://opencode.ai/docs/es/go: $0.435 in / $0.87 out / $0.003625
    // cached read per 1M tokens).
    id: "MiMo V2.6 Pro",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "mimo-v2.6-pro" },
    company: "xiaomi",
    reasoning: true,
    defaultThinkingLevel: "high",
    api: "openai-completions",
    baseUrl: "https://opencode.ai/zen/go/v1",
    supportedFiles: ["img", "pdf"],
    temperature: 0.6,
    topP: 0.95,
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    cost: { input: 0.435, output: 0.87, cacheRead: 0.003625, cacheWrite: 0 },
  },
  {
    id: "Muse Spark 1.3",
    userInvocable: true,
    // OpenCode Go model (contributor tier, responses API per the endpoints
    // table at https://opencode.ai/docs/es/go). Pi does not ship it built-in,
    // so it describes its own limits, cost and baseUrl; the api flavor comes
    // from the opencodeGoResponses provider kind (openai-responses).
    provider: { kind: "opencodeGoResponses", modelId: "muse-spark-1.3-contributor" },
    company: "meta",
    // El upstream de OpenCode Go no soporta el Responses API stateful: con el
    // default del AI SDK (store=true) el historial se reenvía como
    // item_reference y el upstream falla con "No function call found for
    // function call output". Con store:false los items viajan completos
    // (function_call, reasoning con encrypted_content, …).
    providerOptions: { openai: { store: false } },
    reasoning: true,
    defaultThinkingLevel: "xhigh",
    baseUrl: "https://opencode.ai/zen/go/v1",
    thinkingLevelMap: {
      off: null,
      minimal: "minimal",
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
    },
    supportedFiles: ["img"],
    temperature: 1,
    topP: 0.95,
    topK: 64,
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    cost: { input: 0.1, output: 0.2, cacheRead: 0.002, cacheWrite: 0.002 },
  },
  {
    // Gateway model Pi does not ship, so it describes its own limits and
    // cost. Reasoning is mandatory and the provider only supports
    // low/medium/high effort, so off/minimal are hidden and xhigh is not
    // exposed; the highest supported level (high) is the session default.
    id: "Gemini 3.7 Flash",
    userInvocable: true,
    provider: { kind: "gateway", modelId: "google/gemini-3.7-flash" },
    company: "google",
    reasoning: true,
    defaultThinkingLevel: "high",
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: "low",
      medium: "medium",
      high: "high",
    },
    contextWindow: 1_048_576,
    maxTokens: 65_536,
    cost: { input: 0.375, output: 1.875, cacheRead: 0.0375, cacheWrite: 0.020833 },
    supportedFiles: ["img", "pdf"],
    temperature: 0.6,
  },
  {
    // Pi does not ship this model on opencode-go, so it describes its own
    // limits, cost and endpoint (openai-completions per the endpoints table
    // at https://opencode.ai/docs/es/go).
    id: "GLM 5.3",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "glm-5.3" },
    company: "zai",
    reasoning: true,
    defaultThinkingLevel: "high",
    thinkingLevelMap: {
      off: null,
      minimal: "minimal",
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
    },
    supportedFiles: ["img"],
    api: "openai-completions",
    baseUrl: "https://opencode.ai/zen/go/v1",
    temperature: 0.6,
    topP: 0.95,
    contextWindow: 1_000_000,
    maxTokens: 128_000,
    cost: { input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 0 },
  },
  {
    // Pi does not ship this model, so it describes its own limits, cost and
    // endpoint (openai-completions per the endpoints table at
    // https://opencode.ai/docs/es/go).
    id: "Hy3",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "hy3" },
    company: "tencent",
    reasoning: true,
    defaultThinkingLevel: "high",
    api: "openai-completions",
    baseUrl: "https://opencode.ai/zen/go/v1",
    thinkingLevelMap: {
      off: "no_think",
      minimal: null,
      low: "low",
      medium: null,
      high: "high",
    },
    contextWindow: 262_144,
    maxTokens: 128_000,
    cost: { input: 0.14, output: 0.58, cacheRead: 0.038, cacheWrite: 0 },
  },
  {
    // GLM 5.3 Flash servido por opencode-go (api openai-completions per the
    // endpoints table at https://opencode.ai/docs/es/go). Pi no trae el modelo
    // built-in, así que se auto-describe.
    id: "GLM 5.3 Flash",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "glm-5.3-flash" },
    company: "zai",
    reasoning: true,
    defaultThinkingLevel: "high",
    api: "openai-completions",
    baseUrl: "https://opencode.ai/zen/go/v1",
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: "low",
      medium: null,
      high: "high",
      xhigh: "max",
    },
    supportedFiles: ["img", "pdf"],
    temperature: 0.6,
    topP: 0.95,
    contextWindow: 1_000_000,
    maxTokens: 131_072,
    cost: { input: 0.075, output: 0.25, cacheRead: 0.015, cacheWrite: 0 },
  },
  {
    // Modelo stealth gratis de OpenCode Go ("por tiempo limitado"). Sustituye
    // a Union Alpha Free, que solo existía por el endpoint Anthropic y ya no
    // aparece en /zen/go/v1/models. Se sirve por /zen/go/v1/chat/completions
    // (@ai-sdk/openai-compatible — tabla Endpoints de
    // https://opencode.ai/v2/docs/console/go), de ahí el provider kind
    // opencodeGo. En ráfagas el edge responde 503 "Endpoint is
    // unavailable" de forma transitoria (modelo gratis limitado por
    // capacidad): los clientes del chatbot reintentan 5xx en el fetch
    // (retrying-fetch.ts) y el worker de Pi a nivel de provider
    // (provider-retry-defaults.ts). Pi no lo trae built-in, así que se auto-describe
    // con los límites del registry de opencode-go (1M contexto / 512k
    // salida) y coste cero (columna "Free" de la tabla de uso). El registry
    // expone effort low..max, así que el thinkingLevelMap remite xhigh a max
    // y no mapea off/minimal (el modelo no acepta menos de low).
    id: "Space Bunny Free",
    userInvocable: true,
    provider: { kind: "opencodeGo", modelId: "space-bunny-free" },
    company: "ai chatbot",
    reasoning: true,
    defaultThinkingLevel: "high",
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "max",
    },
    api: "openai-completions",
    baseUrl: "https://opencode.ai/zen/go/v1",
    supportedFiles: ["img"],
    contextWindow: 1_048_576,
    maxTokens: 524_288,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
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
    provider: { kind: "deepinfra", modelId: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo" },
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
    provider: { kind: "gateway", modelId: "openai/gpt-oss-20b" },
    company: "openai",
    reasoning: true,
    temperature: 0.6,
    providerOptions: {
      gateway: {
        order: ["groq"],
        zeroDataRetention: true,
      },
    },
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
    // Vercel AI Gateway route: provider/model. Zero data retention.
    provider: { kind: "gateway", modelId: "google/gemini-3.1-flash-lite" },
    company: "google",
    temperature: 0.6,
    providerOptions: { gateway: { zeroDataRetention: true } },
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
    id: "Gemma 4 26B",
    userInvocable: false,
    provider: { kind: "deepinfra", modelId: "google/gemma-4-26B-A4B-it" },
    company: "google",
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

export const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

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
    // "xhigh" y "max" son opt-in: solo se exponen si el catálogo los mapea
    // explícitamente para el modelo ("max" llegó con Pi 0.80.6).
    if (level === "xhigh" || level === "max") return mapped !== undefined;
    return true;
  });
}
