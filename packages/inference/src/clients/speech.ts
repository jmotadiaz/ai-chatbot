import { createOpenAI } from "@ai-sdk/openai";
import type { SpeechModelV3 } from "@ai-sdk/provider";
import { config } from "config";
import type { SpeechClients } from "../types";

/**
 * Speech is not a `ProviderKind` (it is a different endpoint than the
 * language-model one), so it gets its own lazy client registry keyed by
 * `SpeechProviderKind` instead of an entry in `InferenceClients`. Reuses the
 * same `OPENAI_API_KEY` the "openai" language client reads (`clients/openai.ts`)
 * — read a second, independent time because the SDK ties a client instance to
 * one model type.
 */
export function buildSpeechClients(): SpeechClients {
  let _openai: ReturnType<typeof createOpenAI> | null = null;
  const get = () => {
    if (!_openai) {
      _openai = createOpenAI({ apiKey: config.openaiApiKey() });
    }
    return _openai;
  };
  return {
    openai: (modelId): SpeechModelV3 => get().speech(modelId),
  };
}
