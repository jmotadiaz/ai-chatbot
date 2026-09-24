import "server-only";

import type { LanguageModelRole, ModelId } from "models";
import type { ProviderOptions } from "./types";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";

/**
 * Thin reexport over the composition root's `languageModel`: same signature,
 * same Model Configuration shape as before, now also accepting a Model Role
 * (`LANGUAGE_MODEL_ROLES` in `models`) alongside a raw catalog id — internal
 * features migrate to a role; the user-selected Chat Modes keep passing an
 * id. The eager `Record<ModelId, …>` this module used to build at import
 * time is gone — resolution is lazy and memoized inside `packages/inference`
 * now (one construction per resolved id, on first use).
 */
export const languageModelConfigurations = (
  modelKey: ModelId | LanguageModelRole,
  options: { providerOptions?: ProviderOptions } = {},
) => inferenceKit.languageModel(modelKey, options);
