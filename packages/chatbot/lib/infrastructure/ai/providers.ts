import "server-only";
import { inferenceKit } from "./inference-kit";
import type { Providers } from "@/lib/features/foundation-model/types";

/**
 * Thin reexport over the composition root (`./inference-kit`): the per-kind
 * language-model clients, kept so no feature has to change its import while
 * it migrates to the `inference` kit directly. Embedding and rerank are no
 * longer here — RAG and memory call `inferenceKit.embed`/`inferenceKit.rerank`
 * directly (see `@/lib/infrastructure/ai/inference-kit`). See
 * `packages/inference` for where the real construction now lives.
 */
export const providers: Providers = {
  ...inferenceKit.clients,
};
