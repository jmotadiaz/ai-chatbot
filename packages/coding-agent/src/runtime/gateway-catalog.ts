import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  GATEWAY_THINKING_LEVELS,
  type GatewayModelCost,
  type GatewayModelEntry,
  type ThinkingLevel,
} from "config";
import { config } from "config";
import { getTraceLogger } from "tracing";
import { getAuthJsonPath, getModelsJsonPath } from "./models";

/**
 * Runtime model catalog, synced from the Model Gateway (ADR 0010).
 *
 * The worker no longer ships a static catalog (`packages/models` is gone):
 * on startup it fetches `GET ${MODEL_GATEWAY_URL}/v1/models/catalog` and
 * materializes the Pi `models.json` with a single provider (`model-gateway`),
 * so every model Pi streams through the Gateway's OpenAI-compatible endpoint.
 * The synced catalog also stays in process memory — it is the source of the
 * thinking levels the session facade exposes, replacing the retired
 * `getSupportedThinkingLevels` helper of the old static catalog.
 *
 * Pi model id = catalog id, 1:1: the Gateway's ids are the stable names both
 * consumers (chatbot Model Picker, coding-agent worker) share.
 */

export const GATEWAY_PROVIDER_ID = "model-gateway";

// Tipos del contrato del Gateway (única copia TS en packages/config).
export type { GatewayModelCost, GatewayModelEntry, ThinkingLevel };

export const THINKING_LEVELS: readonly ThinkingLevel[] = GATEWAY_THINKING_LEVELS;

/**
 * Model-level thinking controls, keyed by Pi thinking level. A string value is
 * what gets sent to the provider (`reasoning_effort`) for that level; null
 * marks the level as unsupported (hidden/clamped away by Pi).
 */
export type ThinkingLevelMap = Partial<Record<ThinkingLevel, string | null>>;

/** Entry of `GET /v1/models/catalog` (see CONTRACT.md in model-gateway). */

/**
 * Pi model definition for a model Pi does not ship built-in (the
 * `model-gateway` provider is unknown to Pi), so every field Pi needs must be
 * explicit — omitted fields fall back to generic defaults (128k context, 16k
 * max tokens, zero cost).
 */
export interface GatewayPiModelDefinition {
  id: string;
  name: string;
  reasoning: boolean;
  input: Array<"text" | "image">;
  contextWindow: number;
  maxTokens: number;
  cost: GatewayModelCost;
  /** Explicit level mapping so Pi's clamp/getAvailableThinkingLevels mirror the catalog. */
  thinkingLevelMap?: ThinkingLevelMap;
}

export interface GatewayPiProviderConfig {
  baseUrl: string;
  api: "openai-completions";
  /** models.json env-var syntax — Pi resolves it at request time. */
  apiKey: "$MODEL_GATEWAY_API_KEY";
  models: GatewayPiModelDefinition[];
}

export interface GatewayPiModelsJson {
  providers: Record<typeof GATEWAY_PROVIDER_ID, GatewayPiProviderConfig>;
}

/**
 * The `thinkingLevels` of the catalog are the authoritative supported list.
 * Every non-`off` level is mapped explicitly — to itself when supported (the
 * Gateway serves `reasoning_effort` verbatim to LiteLLM), null when not — so
 * Pi exposes exactly the catalog's levels instead of its permissive default
 * (everything but opt-in xhigh/max). `off` stays unmapped: Pi treats an
 * absent entry as "supported, no reasoning effort sent", which is the right
 * provider encoding for disabled thinking.
 */
export function buildThinkingLevelMap(entry: GatewayModelEntry): ThinkingLevelMap | undefined {
  if (!entry.reasoning) return undefined;
  const map: ThinkingLevelMap = {};
  for (const level of THINKING_LEVELS) {
    if (level === "off") continue;
    map[level] = entry.thinkingLevels.includes(level) ? level : null;
  }
  return map;
}

/** Fallbacks when the catalog entry is sparse (null), matching Pi's own generic defaults. */
const FALLBACK_CONTEXT_WINDOW = 128_000;
const FALLBACK_MAX_TOKENS = 16_384;

/** Translate a catalog entry 1:1 into a Pi model definition (id = id). */
export function toPiModelDefinition(entry: GatewayModelEntry): GatewayPiModelDefinition {
  return {
    id: entry.id,
    name: entry.id,
    reasoning: entry.reasoning,
    input: entry.supportedFiles.includes("img") ? ["text", "image"] : ["text"],
    contextWindow: entry.contextWindow ?? FALLBACK_CONTEXT_WINDOW,
    maxTokens: entry.maxTokens ?? FALLBACK_MAX_TOKENS,
    cost: entry.cost,
    thinkingLevelMap: buildThinkingLevelMap(entry),
  };
}

/** Build the worker's `models.json`: a single `model-gateway` provider. */
export function buildPiModelsJson(
  catalog: readonly GatewayModelEntry[],
  gatewayUrl: string,
): GatewayPiModelsJson {
  return {
    providers: {
      [GATEWAY_PROVIDER_ID]: {
        baseUrl: `${gatewayUrl.replace(/\/+$/, "")}/v1`,
        api: "openai-completions",
        apiKey: "$MODEL_GATEWAY_API_KEY",
        models: catalog.map(toPiModelDefinition),
      },
    },
  };
}

/** auth.json credential shape for an api-key provider. */
interface AuthJsonEntry {
  type: "api_key";
  key: string;
}
type AuthJson = Record<string, AuthJsonEntry>;

/**
 * Ensure the `model-gateway` entry in the per-Entorno auth.json: creates the
 * file when missing, preserves every other entry, and only rewrites the file
 * when our entry is actually absent or stale (a matching key means the file on
 * disk is already correct — nothing to touch).
 */
export function ensureGatewayAuthJson(authPath: string, apiKey: string): void {
  let auth: AuthJson = {};
  try {
    auth = JSON.parse(readFileSync(authPath, "utf8")) as AuthJson;
  } catch {
    // Missing or unparsable: start from scratch (first run, or a corrupt file
    // the worker could not have used anyway).
  }
  if (typeof auth !== "object" || auth === null || Array.isArray(auth)) auth = {};

  const current = auth[GATEWAY_PROVIDER_ID];
  if (current?.type === "api_key" && current.key === apiKey) return;

  auth[GATEWAY_PROVIDER_ID] = { type: "api_key", key: apiKey };
  mkdirSync(path.dirname(authPath), { recursive: true });
  writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`);
}

function assertCatalog(payload: unknown, url: string): GatewayModelEntry[] {
  const models = (payload as { models?: unknown })?.models;
  if (!Array.isArray(models)) {
    throw new Error(
      `Model Gateway catalog response from ${url} is malformed: expected ` +
        `{"models": [...]}. Upgrade or restart model-gateway.service.`,
    );
  }
  return models.map((entry, index) => {
    // contextWindow/maxTokens pueden ser null (entradas sparse del contrato
    // compartido); lo que NO puede faltar es id y cost.
    const candidate = entry as GatewayModelEntry;
    if (
      typeof entry !== "object" || entry === null ||
      typeof candidate.id !== "string" ||
      !(candidate.contextWindow === null || typeof candidate.contextWindow === "number") ||
      !(candidate.maxTokens === null || typeof candidate.maxTokens === "number") ||
      typeof candidate.cost !== "object"
    ) {
      throw new Error(
        `Model Gateway catalog entry #${index} from ${url} is malformed ` +
          `(missing id/contextWindow/maxTokens/cost). Check model-gateway.service.`,
      );
    }
    return entry as GatewayModelEntry;
  });
}

async function fetchGatewayCatalog(gatewayUrl: string, apiKey: string): Promise<GatewayModelEntry[]> {
  const catalogUrl = `${gatewayUrl.replace(/\/+$/, "")}/v1/models/catalog`;
  let response: Response;
  try {
    response = await fetch(catalogUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch (cause) {
    throw new Error(
      `Cannot reach the Model Gateway at ${gatewayUrl} (MODEL_GATEWAY_URL): ` +
        `${cause instanceof Error ? cause.message : String(cause)}. ` +
        "The coding-agent worker needs a live catalog to build its models.json — " +
        "start model-gateway.service (systemctl start model-gateway; in test, the " +
        "Mock Model Gateway on :4001) and retry.",
      { cause },
    );
  }
  if (!response.ok) {
    throw new Error(
      `Model Gateway catalog request failed: GET ${catalogUrl} → HTTP ` +
        `${response.status} ${response.statusText}. Check MODEL_GATEWAY_URL and ` +
        "MODEL_GATEWAY_API_KEY, and that model-gateway.service is running.",
    );
  }
  return assertCatalog(await response.json(), catalogUrl);
}

// --- In-process snapshot of the synced catalog ------------------------------

let syncedCatalog: GatewayModelEntry[] | undefined;

/** Catalog synced by the last `ensureGatewayModelsJson()` (undefined before). */
export function getSyncedGatewayCatalog(): readonly GatewayModelEntry[] {
  return syncedCatalog ?? [];
}

/** Test hook: drop the in-process catalog snapshot. */
export function resetGatewayCatalogForTests(): void {
  syncedCatalog = undefined;
}

/**
 * Sync the runtime catalog from the Gateway: fetch, write `models.json`
 * (single `model-gateway` provider), ensure `auth.json`, and cache the
 * catalog in process memory. Must run before `ModelRuntime.create()` — the
 * runtime reads the file-backed catalog, so without this sync the worker
 * would start with an empty model list.
 */
export async function ensureGatewayModelsJson(): Promise<readonly GatewayModelEntry[]> {
  const log = getTraceLogger("worker");
  const gatewayUrl = config.modelGatewayUrl();
  const apiKey = config.modelGatewayApiKey();
  if (!apiKey) {
    throw new Error(
      "MODEL_GATEWAY_API_KEY is not set: the coding-agent worker authenticates " +
        "against the Model Gateway (MODEL_GATEWAY_URL) with it to fetch the " +
        "model catalog. Set it in the environment file of this Entorno.",
    );
  }

  const catalog = await fetchGatewayCatalog(gatewayUrl, apiKey);

  const modelsJson = buildPiModelsJson(catalog, gatewayUrl);
  const modelsPath = getModelsJsonPath();
  mkdirSync(path.dirname(modelsPath), { recursive: true });
  writeFileSync(modelsPath, `${JSON.stringify(modelsJson, null, 2)}\n`);
  ensureGatewayAuthJson(getAuthJsonPath(), apiKey);

  syncedCatalog = catalog;
  log.info("gateway.catalog.synced", {
    models: catalog.length,
    modelsPath,
  });
  return catalog;
}
