import "server-only";

import type { ModelId } from "models";
import type { ProviderOptions } from "./types";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";

/**
 * Thin reexport over the composition root's `languageModel`: same signature,
 * same Model Configuration shape as before. The eager `Record<ModelId, …>`
 * this module used to build at import time is gone — resolution is lazy and
 * memoized inside `packages/inference` now (one construction per id, on
 * first use).
 */
export const languageModelConfigurations = (
  modelKey: ModelId,
  options: { providerOptions?: ProviderOptions } = {},
) => inferenceKit.languageModel(modelKey, options);
