import { createXai } from "@ai-sdk/xai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { config } from "config";
import { buildLazyLanguageModelClient } from "./lazy-client";

/** Built explicitly and lazily instead of the module-scope `createXai()` singleton chatbot's `providers.ts` used to build eagerly, so `XAI_API_KEY` is read via `config` and no client exists until first use. */
export function buildXaiClient(): (modelId: string) => LanguageModelV3 {
  return buildLazyLanguageModelClient(() =>
    createXai({ apiKey: config.xaiApiKey() }),
  );
}
