import "server-only";
import { embeddingClient, inferenceKit, rerankClient } from "./inference-kit";
import type { Providers } from "@/lib/features/foundation-model/types";

/**
 * Thin reexport over the composition root (`./inference-kit`): every
 * per-kind client plus the current embedding/rerank shim, kept so no feature
 * has to change its import while it migrates to the `inference` kit
 * directly. See `packages/inference` and the composition root for where the
 * real construction now lives.
 */
export const providers: Providers = {
  ...inferenceKit.clients,
  embedding: embeddingClient,
  rerank: rerankClient,
};
