import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { buildLazyLanguageModelClient } from "./lazy-client";

/** Local model server; no key. Still lazy so nothing is built at import time. */
export function buildLmstudioClient(): (modelId: string) => LanguageModelV3 {
  return buildLazyLanguageModelClient(() =>
    createOpenAICompatible({
      name: "lmstudio",
      baseURL: "http://localhost:1234/v1",
    }),
  );
}
