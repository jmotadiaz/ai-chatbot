import { createGroq } from "@ai-sdk/groq";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { config } from "config";

/** Built explicitly instead of importing the SDK's bare `groq` singleton, so `GROQ_API_KEY` is read via `config`. */
export function buildGroqClient(): (modelId: string) => LanguageModelV3 {
  let _groq: ReturnType<typeof createGroq> | null = null;
  const get = () => {
    if (!_groq) {
      _groq = createGroq({ apiKey: config.groqApiKey() });
    }
    return _groq;
  };
  return (modelId) => get()(modelId);
}
