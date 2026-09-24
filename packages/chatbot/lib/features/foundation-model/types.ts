import type { Company } from "models";
// Types definitions for the models feature

// --- From definition.ts ---

export type { Company };

// `ModelConfiguration`, `ProviderOptions` and `RerankResult` are owned by the
// `inference` package now (it must stay importable from a plain Node/tsx
// process, so it cannot depend back on chatbot feature code); reexported here
// so nothing in the chatbot has to change its import path.
export type { ModelConfiguration, ProviderOptions, RerankResult } from "inference";

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
