import { randomUUID } from "node:crypto";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { config } from "config";
import { createRetryingFetch } from "../retrying-fetch";

const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1";
const OPENCODE_ZEN_BASE_URL = "https://opencode.ai/zen/v1";

/**
 * OpenCode Go exige identificar cada request con una sesión estable
 * (https://opencode.ai/docs/go/#where-can-i-use-it): sin el header
 * x-opencode-session el edge devuelve AI_APICallError "Request is missing
 * x-opencode-session and cannot be routed efficiently". Es un id estable por
 * instancia del kit: agrupa el tráfico en una sesión que OpenCode usa para
 * routing y prompt caching. También pide un user-agent propio en vez del
 * genérico del SDK.
 */
export function createOpencodeHeaders(): Record<string, string> {
  return {
    "x-opencode-session": randomUUID(),
    "user-agent": "ai-chatbot/1.0",
  };
}

export interface OpencodeClients {
  opencodeGo: (modelId: string) => LanguageModelV3;
  opencodeGoResponses: (modelId: string) => LanguageModelV3;
  opencodeGoAnthropic: (modelId: string) => LanguageModelV3;
  opencodeZen: (modelId: string) => LanguageModelV3;
}

/**
 * The four OpenCode-flavored endpoint kinds share one session id, one set of
 * headers and (except Zen) one retrying fetch, so they are built together
 * instead of duplicating that setup across four modules. Each client is
 * still its own lazy, memoized getter.
 */
export function buildOpencodeClients(): OpencodeClients {
  const headers = createOpencodeHeaders();
  // El edge de OpenCode Go devuelve 503 transitorios ("Endpoint is
  // unavailable") en ráfagas y el AI SDK no los marca reintentables para el
  // provider anthropic, así que el fetch de los clientes de Go reintenta 5xx.
  const opencodeFetch = createRetryingFetch(fetch);

  let _go: ReturnType<typeof createOpenAICompatible> | null = null;
  const getGo = () => {
    if (!_go) {
      _go = createOpenAICompatible({
        name: "opencode-zen-go",
        apiKey: config.opencodeZenApiKey(),
        baseURL: OPENCODE_GO_BASE_URL,
        headers,
        fetch: opencodeFetch,
      });
    }
    return _go;
  };

  let _goResponses: ReturnType<typeof createOpenAI> | null = null;
  const getGoResponses = () => {
    if (!_goResponses) {
      _goResponses = createOpenAI({
        name: "opencode-zen-go-responses",
        apiKey: config.opencodeZenApiKey(),
        baseURL: OPENCODE_GO_BASE_URL,
        headers,
        fetch: opencodeFetch,
      });
    }
    return _goResponses;
  };

  let _goAnthropic: ReturnType<typeof createAnthropic> | null = null;
  const getGoAnthropic = () => {
    if (!_goAnthropic) {
      // OpenCode Go también puede servir modelos solo por el endpoint
      // Anthropic: @ai-sdk/anthropic pide `${baseURL}/messages`,
      // así que aquí el baseURL lleva /v1 (en el catálogo, orientado a Pi, el
      // baseUrl es "https://opencode.ai/zen/go" porque Pi añade /v1/messages).
      _goAnthropic = createAnthropic({
        name: "opencode-zen-go-anthropic",
        apiKey: config.opencodeZenApiKey(),
        baseURL: OPENCODE_GO_BASE_URL,
        headers,
        fetch: opencodeFetch,
      });
    }
    return _goAnthropic;
  };

  let _zen: ReturnType<typeof createOpenAICompatible> | null = null;
  const getZen = () => {
    if (!_zen) {
      // No `fetch:` override on purpose (matches current behaviour): unlike
      // the three Go-flavored clients above, Zen gets no 5xx retry today.
      _zen = createOpenAICompatible({
        name: "opencode-zen",
        apiKey: config.opencodeZenApiKey(),
        baseURL: OPENCODE_ZEN_BASE_URL,
        headers,
      });
    }
    return _zen;
  };

  return {
    opencodeGo: (modelId) => getGo()(modelId),
    opencodeGoResponses: (modelId) => getGoResponses().responses(modelId),
    opencodeGoAnthropic: (modelId) => getGoAnthropic().messages(modelId),
    opencodeZen: (modelId) => getZen()(modelId),
  };
}
