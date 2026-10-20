/**
 * Tipos isomorfos y helpers PUROS del catálogo de modelos (antes
 * `packages/models`, ADR 0010). Sin ningún import de `models`: el catálogo
 * llega en runtime del Model Gateway (`GET /v1/models/catalog`) y se pasa
 * explícito a cada helper. Es el único módulo de configuración de modelos
 * que pueden importar los `"use client"` (el kit de infraestructura está
 * prohibido para ellos por lint).
 */

export type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

/** Libre desde el Gateway: la compañía ya no es una unión tipada. */
export type Company = string;

/**
 * Id de un modelo de chat. Con el Gateway único desaparece la unión literal
 * `InvocableModelId`: la validez se valida contra el catálogo en runtime
 * (`resolveChatModelId`, `getChatConfigurationByModelId`).
 */
export type chatModelId = string;

export const defaultWebSearchNumResults = 4;
export const defaultRagMaxResources = 4;
export const defaultMinRagScore = 0.5;

/** Entrada del catálogo tal como la sirve el Gateway (contrato compartido §1). */
export interface GatewayModelEntry {
  id: string;
  company: string;
  isDefault: boolean;
  /** null en entradas sparse (contratos de embedding/rerank/tts sin ventana). */
  contextWindow: number | null;
  maxTokens: number | null;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  reasoning: boolean;
  thinkingLevels: string[];
  defaultThinkingLevel: string | null;
  supportedFiles: ("img" | "pdf")[];
  supportedOutput: ("text" | "img")[];
  zeroDataRetention: boolean;
  temperature: number | null;
  topP: number | null;
  topK: number | null;
}

/**
 * Los 10 Default Model Contracts (`user_invocable: false` en el Gateway):
 * nombres estables que las features internas invocan directamente. Nunca
 * aparecen en el Model Picker (`chatModelKeys` los excluye).
 */
export const DEFAULT_MODEL_CONTRACTS = [
  "fast-default",
  "flash-default",
  "vision-default",
  "reasoning-default",
  "free-default",
  "image-default",
  "embedding-default",
  "rerank-default",
  "decision-default",
  "tts-default",
] as const;

export type DefaultModelContract = (typeof DEFAULT_MODEL_CONTRACTS)[number];

const CONTRACT_IDS: readonly string[] = DEFAULT_MODEL_CONTRACTS;

const isContractId = (id: string): boolean => CONTRACT_IDS.includes(id);

export const THINKING_LEVELS: ThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return typeof value === "string" && (THINKING_LEVELS as string[]).includes(value);
}

/** Ids seleccionables del catálogo: los user-invocable, sin los contratos `*-default`. */
export const chatModelKeys = (catalog: GatewayModelEntry[]): chatModelId[] =>
  catalog.filter((entry) => !isContractId(entry.id)).map((entry) => entry.id);

/** El modelo por defecto: la entrada `isDefault` del catálogo (o la primera seleccionable). */
export const defaultModel = (catalog: GatewayModelEntry[]): chatModelId =>
  catalog.find((entry) => entry.isDefault && !isContractId(entry.id))?.id ??
  chatModelKeys(catalog)[0]!;

/**
 * Parses a persisted model id (`Chat.defaultModel`, `Project.defaultModel`)
 * before it reaches the chat. Those columns are free-form and nullable: rows
 * written without a model hold NULL, and catalog retunes retire ids that older
 * rows still reference. `getChatConfigurationByModelId` throws for unknown
 * ids while rendering the chat, so they fall back to the default model. Any
 * other catalog id is kept, including models no longer offered in the picker.
 */
export const resolveChatModelId = (
  catalog: GatewayModelEntry[],
  modelId: string | null | undefined,
): chatModelId =>
  modelId && catalog.some((entry) => entry.id === modelId)
    ? modelId
    : defaultModel(catalog);

const getCatalogEntry = (
  catalog: GatewayModelEntry[],
  modelId: string,
): GatewayModelEntry => {
  const entry = catalog.find((e) => e.id === modelId);
  if (!entry) {
    throw new Error(`Model ${modelId} not found in the model catalog`);
  }
  return entry;
};

export interface ChatModelConfiguration {
  company: Company;
  temperature?: number;
  topP?: number;
  topK?: number;
  contextWindow?: number;
  reasoning: boolean;
  zeroDataRetention?: boolean;
  supportedFiles: ("pdf" | "img")[];
  supportedOutput: ("text" | "img")[];
}

export const getChatConfigurationByModelId = (
  catalog: GatewayModelEntry[],
  modelId: chatModelId,
): ChatModelConfiguration => {
  const entry = getCatalogEntry(catalog, modelId);

  return {
    company: entry.company,
    temperature: entry.temperature ?? undefined,
    topP: entry.topP ?? undefined,
    topK: entry.topK ?? undefined,
    // null (entradas sparse) → undefined: los consumidores caen a
    // `config.contextWindow()` (p. ej. factory.ts, orchestration.ts).
    contextWindow: entry.contextWindow ?? undefined,
    reasoning: entry.reasoning,
    zeroDataRetention: entry.zeroDataRetention,
    supportedFiles: [...entry.supportedFiles],
    supportedOutput: [...entry.supportedOutput],
  };
};

/** Nivel de razonamiento por defecto de un modelo, según el catálogo. */
export const getDefaultThinkingLevel = (
  catalog: GatewayModelEntry[],
  modelId: chatModelId,
): ThinkingLevel | undefined =>
  (getCatalogEntry(catalog, modelId).defaultThinkingLevel ??
    undefined) as ThinkingLevel | undefined;

/** ¿El id existe en el catálogo (incluidos los contratos)? Validación runtime. */
export const isKnownModelId = (
  catalog: GatewayModelEntry[],
  modelId: string | null | undefined,
): modelId is string =>
  typeof modelId === "string" && catalog.some((entry) => entry.id === modelId);
