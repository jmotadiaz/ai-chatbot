import type { rerank } from "ai";
import type { LanguageModelV3, EmbeddingModelV3 } from "@ai-sdk/provider";
import type { Company, ProviderKind } from "models";
import type { RerankResult } from "inference";
// Types definitions for the models feature

// --- From definition.ts ---

export type { Company };

// `ModelConfiguration`, `ProviderOptions` and `RerankResult` are owned by the
// `inference` package now (it must stay importable from a plain Node/tsx
// process, so it cannot depend back on chatbot feature code); reexported here
// so nothing in the chatbot has to change its import path.
export type { ModelConfiguration, ProviderOptions, RerankResult } from "inference";

// --- From providers.ts ---

// Language-model clients, one per endpoint kind. `ProviderKind` is the Model
// Catalog's key of client + API flavor (see `models`); deriving this map from
// it means an unused or missing kind is a compile error here, not a silent
// gap. Embedding and rerank are not endpoint kinds in the catalog, so they
// stay as their own operations on the same registry.
export interface Providers extends Record<ProviderKind, (modelId: string) => LanguageModelV3> {
  embedding: () => EmbeddingModelV3;
  rerank: () => (
    args: Omit<Parameters<typeof rerank>[0], "model">,
  ) => Promise<RerankResult[]>;
}

/**
 * Legacy Model Router metadata.
 *
 * The Model Router itself (query classification into category/complexity,
 * then a model pick) is gone: `router.ts` and its prompts were deleted, and
 * nothing constructs this shape anymore. It is kept only so a
 * `Message.metadata.autoModel` persisted before the removal still decodes
 * and renders — the same treatment as `ChatModeRoutingReason`'s
 * `low_confidence` member.
 */
export interface ModelRoutingMetadata {
  category:
    | "factual"
    | "analytical"
    | "technical"
    | "creative"
    | "prompt_engineering"
    | "image_generation"
    | "conversational"
    | "processing"
    | "other";
  complexity: "simple" | "moderate" | "complex" | "advanced";
  model: string;
}
