import { MODEL_CATALOG, type ModelCatalogEntry, type ModelCost } from "./catalog";
import { PI_PROVIDER } from "./mapping";

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
}

export interface PiModelsJson {
  providers: Record<string, { models: PiModelDefinition[] }>;
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
  };
}

export function generateModelsJson(
  catalog: readonly ModelCatalogEntry[] = MODEL_CATALOG,
  { builtIns }: GenerateModelsJsonOptions = {},
): PiModelsJson {
  const models = catalog
    .filter((e) => e.userInvocable)
    .map((e) => buildModelDefinition(e, builtIns?.get(e.provider.modelId)));

  return { providers: { [PI_PROVIDER]: { models } } };
}
