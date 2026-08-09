import { MODEL_CATALOG, type ModelCatalogEntry, type ModelCost, type ThinkingLevelMap } from "./catalog";
import { CUSTOM_PI_PROVIDERS, toPiProviderId } from "./mapping";

/**
 * Metadata Pi already knows about a model, keyed by its Pi model id.
 *
 * Pi merges models.json over its built-in list by provider + id and fills any
 * omitted field with a generic default (128k context, 16k max tokens, zero
 * cost). Emitting a partial entry for a model Pi already ships would therefore
 * silently downgrade it, so the catalog is merged on top of these baselines
 * instead of replacing them.
 */
export interface PiModelBaseline {
  reasoning?: boolean;
  input?: Array<"text" | "image">;
  contextWindow?: number;
  maxTokens?: number;
  cost?: ModelCost;
  /** Pi's built-in api flavor (e.g. "openai-completions", "anthropic-messages"). */
  api?: string;
  /** Pi's built-in base url for the model. */
  baseUrl?: string;
  /** Pi's built-in thinking level map (levels and their provider values). */
  thinkingLevelMap?: ThinkingLevelMap;
}

export interface PiModelDefinition {
  id: string;
  name: string;
  reasoning: boolean;
  input: Array<"text" | "image">;
  contextWindow: number;
  maxTokens: number;
  cost: ModelCost;
  api?: string;
  baseUrl?: string;
  /** Emitted so pi's ModelRegistry keeps the built-in thinking level map; without it, getSupportedThinkingLevels caps at "high". */
  thinkingLevelMap?: ThinkingLevelMap;
}

export interface PiProviderConfig {
  /** Solo para providers custom (no built-in en Pi): endpoint de la API. */
  baseUrl?: string;
  /** Solo para providers custom: api flavor de streaming. */
  api?: string;
  /** Solo para providers custom: apiKey con sintaxis de models.json ("$ENV_VAR"). */
  apiKey?: string;
  models: PiModelDefinition[];
}

export interface PiModelsJson {
  providers: Record<string, PiProviderConfig>;
}

export interface GenerateModelsJsonOptions {
  /** Pi's built-in metadata, keyed by Pi model id. */
  builtIns?: ReadonlyMap<string, PiModelBaseline>;
}

function buildModelDefinition(
  entry: ModelCatalogEntry,
  baseline: PiModelBaseline | undefined,
): PiModelDefinition {
  // The catalog only overrides what it declares; the rest is inherited.
  const contextWindow = entry.contextWindow ?? baseline?.contextWindow;
  const maxTokens = entry.maxTokens ?? baseline?.maxTokens;
  const cost = entry.cost ?? baseline?.cost;

  if (
    contextWindow === undefined ||
    maxTokens === undefined ||
    cost === undefined
  ) {
    const missing = [
      ...(contextWindow === undefined ? ["contextWindow"] : []),
      ...(maxTokens === undefined ? ["maxTokens"] : []),
      ...(cost === undefined ? ["cost"] : []),
    ];
    throw new Error(
      `Cannot generate models.json for "${entry.id}": Pi has no built-in ` +
        `"${entry.provider.modelId}" and the catalog does not declare ` +
        `${missing.join(", ")}. Add them to the catalog entry.`,
    );
  }

  return {
    id: entry.provider.modelId,
    name: entry.id,
    reasoning: entry.reasoning ?? baseline?.reasoning ?? false,
    input: entry.supportedFiles
      ? entry.supportedFiles.includes("img")
        ? ["text", "image"]
        : ["text"]
      : (baseline?.input ?? ["text"]),
    contextWindow,
    maxTokens,
    cost,
    // Emit Pi's built-in api/baseUrl so the runtime routes to the correct
    // endpoint. Without them, pi's ModelRegistry fills the gaps from the first
    // built-in model of the provider, which silently rewrites e.g.
    // minimax-m3 (anthropic-messages) and qwen3.7-plus (anthropic-messages)
    // to openai-completions and breaks thinking/reasoning streaming.
    api: baseline?.api,
    baseUrl: baseline?.baseUrl,
    // Pi replaces the built-in model wholesale with the models.json entry
    // (mergeCustomModels), so a thinkingLevelMap omitted here silently caps
    // the model's supported levels at "high" (xhigh needs an explicit
    // mapping). Inherit it from the built-in unless the catalog overrides.
    thinkingLevelMap: entry.thinkingLevelMap ?? baseline?.thinkingLevelMap,
  };
}

export function generateModelsJson(
  catalog: readonly ModelCatalogEntry[] = MODEL_CATALOG,
  { builtIns }: GenerateModelsJsonOptions = {},
): PiModelsJson {
  const byProvider = new Map<string, PiModelDefinition[]>();
  for (const entry of catalog.filter((e) => e.userInvocable)) {
    const providerId = toPiProviderId(entry.provider.kind);
    const def = buildModelDefinition(entry, builtIns?.get(entry.provider.modelId));
    byProvider.set(providerId, [...(byProvider.get(providerId) ?? []), def]);
  }

  const providers: PiModelsJson["providers"] = {};
  for (const [providerId, models] of byProvider) {
    const custom = CUSTOM_PI_PROVIDERS[providerId as keyof typeof CUSTOM_PI_PROVIDERS];
    providers[providerId] = custom
      ? {
          baseUrl: custom.baseUrl,
          api: custom.api,
          apiKey: `$${custom.apiKeyEnv}`,
          models,
        }
      : { models };
  }
  return { providers };
}
