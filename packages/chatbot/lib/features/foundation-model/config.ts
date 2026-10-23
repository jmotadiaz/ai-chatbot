/**
 * Isomorphic types and PURE helpers for the model catalog (ADR 0010). No
 * `models` import at all: the catalog arrives at runtime from the Model Gateway
 * (`GET /v1/models/catalog`) and is passed explicitly to each helper. It is the
 * only model configuration module the `"use client"` files may import (the
 * infrastructure kit is forbidden to them by lint).
 *
 * The shared `GatewayModelEntry`/`ThinkingLevel` type lives in
 * `packages/config/src/gateway-contract.ts` (the only TS copy of the contract;
 * see `packages/model-gateway/CONTRACT.md`); here it is only re-exported so the
 * chatbot imports do not break.
 */

import { GATEWAY_THINKING_LEVELS, type GatewayModelEntry, type ThinkingLevel } from "config/contract";

export type { GatewayModelEntry, ThinkingLevel } from "config/contract";

/** Free-form from the Gateway: the company is no longer a typed union. */
export type Company = string;

/**
 * Chat model id. With the single Gateway the literal union `InvocableModelId`
 * is gone: validity is checked against the catalog at runtime
 * (`resolveChatModelId`, `getChatConfigurationByModelId`).
 */
export type chatModelId = string;

export const defaultWebSearchNumResults = 4;
export const defaultRagMaxResources = 4;
export const defaultMinRagScore = 0.5;

/** The 10 Default Model Contracts (`user_invocable: false` in the Gateway):
 * stable names that internal features invoke directly. They never
 * appear in the Model Picker (`chatModelKeys` excludes them).
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

export const THINKING_LEVELS: ThinkingLevel[] = [...GATEWAY_THINKING_LEVELS];

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return typeof value === "string" && (THINKING_LEVELS as string[]).includes(value);
}

/** Selectable catalog ids: the user-invocable ones, without the `*-default` contracts. */
export const chatModelKeys = (catalog: GatewayModelEntry[]): chatModelId[] =>
  catalog.filter((entry) => !isContractId(entry.id)).map((entry) => entry.id);

/** The default model: the catalog's `isDefault` entry (or the first selectable one). */
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
    // null (sparse entries) → undefined: consumers fall back to
    // `config.contextWindow()` (e.g. factory.ts, orchestration.ts).
    contextWindow: entry.contextWindow ?? undefined,
    reasoning: entry.reasoning,
    zeroDataRetention: entry.zeroDataRetention,
    supportedFiles: [...entry.supportedFiles],
    supportedOutput: [...entry.supportedOutput],
  };
};

/** A model's default reasoning level, per the catalog. */
export const getDefaultThinkingLevel = (
  catalog: GatewayModelEntry[],
  modelId: chatModelId,
): ThinkingLevel | undefined =>
  (getCatalogEntry(catalog, modelId).defaultThinkingLevel ??
    undefined) as ThinkingLevel | undefined;

/** Does the id exist in the catalog (contracts included)? Runtime validation. */
export const isKnownModelId = (
  catalog: GatewayModelEntry[],
  modelId: string | null | undefined,
): modelId is string =>
  typeof modelId === "string" && catalog.some((entry) => entry.id === modelId);
