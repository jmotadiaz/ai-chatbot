import "server-only";
import { randomUUID } from "node:crypto";
import { groq } from "@ai-sdk/groq";
import { gateway, rerank } from "ai";
import { createXai } from "@ai-sdk/xai";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { perplexity } from "@ai-sdk/perplexity";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { cohere } from "@ai-sdk/cohere";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { MODEL_CATALOG } from "models";
import { config } from "config";
import { createRetryingFetch } from "./retrying-fetch";
import type { Providers } from "@/lib/features/foundation-model/types";
import { createMockEmbeddingModel, createMockModel } from "@/tests/mocks/ai";
import { MOCK_MODELS } from "@/tests/mocks/ai/registry";
import { isTestMode } from "@/lib/infrastructure/env";

const lmstudio = createOpenAICompatible({
  name: "lmstudio",
  baseURL: "http://localhost:1234/v1",
});

// OpenCode Go exige identificar cada request con una sesión estable
// (https://opencode.ai/docs/go/#where-can-i-use-it): sin el header
// x-opencode-session el edge devuelve AI_APICallError "Request is missing
// x-opencode-session and cannot be routed efficiently". Es un id estable por
// proceso: agrupa el tráfico del chatbot en una sesión que OpenCode usa para
// routing y prompt caching. También pide un user-agent propio en vez del
// genérico del SDK.
const OPENCODE_SESSION_ID = randomUUID();

const opencodeHeaders: Record<string, string> = {
  "x-opencode-session": OPENCODE_SESSION_ID,
  "user-agent": "ai-chatbot/1.0",
};

// El edge de OpenCode Go devuelve 503 transitorios ("Endpoint is
// unavailable") en ráfagas y el AI SDK no los marca reintentables para el
// provider anthropic, así que el fetch de los clientes de Go reintenta 5xx.
const opencodeFetch = createRetryingFetch(fetch);

let _opencodeGo: ReturnType<typeof createOpenAICompatible> | null = null;

function getOpenCodeGo() {
  if (!_opencodeGo) {
    _opencodeGo = createOpenAICompatible({
      name: "opencode-zen-go",
      apiKey: config.opencodeZenApiKey(),
      baseURL: "https://opencode.ai/zen/go/v1",
      headers: opencodeHeaders,
      fetch: opencodeFetch,
    });
  }
  return _opencodeGo;
}

let _opencodeGoResponses: ReturnType<typeof createOpenAI> | null = null;

function getOpenCodeGoResponses() {
  if (!_opencodeGoResponses) {
    _opencodeGoResponses = createOpenAI({
      name: "opencode-zen-go-responses",
      apiKey: config.opencodeZenApiKey(),
      baseURL: "https://opencode.ai/zen/go/v1",
      headers: opencodeHeaders,
      fetch: opencodeFetch,
    });
  }
  return _opencodeGoResponses;
}

// OpenCode Go también sirve algunos modelos (Union Alpha Free) solo por el
// endpoint Anthropic: @ai-sdk/anthropic pide `${baseURL}/messages`, así que
// aquí el baseURL lleva /v1 (en el catálogo, orientado a Pi, el baseUrl es
// "https://opencode.ai/zen/go" porque Pi añade /v1/messages).
let _opencodeGoAnthropic: ReturnType<typeof createAnthropic> | null = null;

function getOpenCodeGoAnthropic() {
  if (!_opencodeGoAnthropic) {
    _opencodeGoAnthropic = createAnthropic({
      name: "opencode-zen-go-anthropic",
      apiKey: config.opencodeZenApiKey(),
      baseURL: "https://opencode.ai/zen/go/v1",
      headers: opencodeHeaders,
      fetch: opencodeFetch,
    });
  }
  return _opencodeGoAnthropic;
}


let _opencodeZen: ReturnType<typeof createOpenAICompatible> | null = null;

function getOpenCodeZen() {
  if (!_opencodeZen) {
    _opencodeZen = createOpenAICompatible({
      name: "opencode-zen",
      apiKey: config.opencodeZenApiKey(),
      baseURL: "https://opencode.ai/zen/v1",
      headers: opencodeHeaders,
    });
  }
  return _opencodeZen;
}

// El provider lee la key de `config` (regla del repo: nada de process.env en
// src/). Se construye perezosamente, igual que el resto de providers, para no
// leer configuración al importar el módulo (tests) y para no congelar la key
// antes de que dotenv cargue.
let _openrouter: ReturnType<typeof createOpenRouter> | null = null;

function getOpenRouter() {
  if (!_openrouter) {
    _openrouter = createOpenRouter({ apiKey: config.openRouterApiKey() });
  }
  return _openrouter;
}

let _deepinfra: ReturnType<typeof createOpenAICompatible> | null = null;

function getDeepInfra() {
  if (!_deepinfra) {
    _deepinfra = createOpenAICompatible({
      name: "deepinfra",
      apiKey: config.deepInfraApiKey(),
      baseURL: "https://api.deepinfra.com/v1/openai",
      supportsStructuredOutputs: false,
    });
  }
  return _deepinfra;
}

// `google` has no ProviderKind (it is not a language-model provider in the
// catalog) and only serves the embedding model below; `xai` is a ProviderKind
// and feeds the `providers.xai` entry, built here to stay lazy like the rest.
const google = createGoogleGenerativeAI();
const xai = createXai();

export const providers: Providers = (() => {
  if (!isTestMode()) {
    return {
      openai: (modelId: string) => openai(modelId),
      xai: (modelId: string) => xai(modelId),
      groq: (modelId: string) => groq(modelId),
      perplexity: (modelId: string) => perplexity(modelId),
      gateway: (modelId: string) => gateway(modelId),
      openrouter: (modelId: string) => getOpenRouter()(modelId),
      deepinfra: (modelId: string) => getDeepInfra()(modelId),
      lmstudio: (modelId: string) => lmstudio(modelId),
      opencodeGo: (modelId: string) => getOpenCodeGo()(modelId),
      opencodeGoResponses: (modelId: string) =>
        getOpenCodeGoResponses().responses(modelId),
      opencodeGoAnthropic: (modelId: string) =>
        getOpenCodeGoAnthropic().messages(modelId),
      opencodeZen: (modelId: string) => getOpenCodeZen()(modelId),
      embedding: () => google.embeddingModel("gemini-embedding-001"),
      rerank: () => async (args) => {
        const { ranking } = await rerank({
          ...args,
          model: cohere.rerankingModel("rerank-v4.0-pro"),
        });

        return ranking;
      },
    };
  }

  // Test mode: look up the model in the MOCK_MODELS registry. Providers are
  // called with the provider-level model id ("anthropic/claude-sonnet-4.6")
  // while the registry is keyed by catalog id ("Claude Sonnet 4.6"), so the
  // catalog is used to translate. Models without a specialized entry fall back
  // to the content-driven createMockModel mock.
  const catalogIdsByProviderModel = new Map(
    MODEL_CATALOG.map((entry) => [
      `${entry.provider.kind}:${entry.provider.modelId}`,
      entry.id,
    ]),
  );

  const lookupMock = (kind: string) => (modelId: string) => {
    const catalogId = catalogIdsByProviderModel.get(`${kind}:${modelId}`);
    const mock = catalogId ? MOCK_MODELS[catalogId] : undefined;
    return mock ? mock.languageModel : createMockModel(modelId);
  };

  return {
    openai: lookupMock("openai"),
    xai: lookupMock("xai"),
    groq: lookupMock("groq"),
    perplexity: lookupMock("perplexity"),
    gateway: lookupMock("gateway"),
    openrouter: lookupMock("openrouter"),
    deepinfra: lookupMock("deepinfra"),
    lmstudio: lookupMock("lmstudio"),
    opencodeGo: lookupMock("opencodeGo"),
    opencodeGoResponses: lookupMock("opencodeGoResponses"),
    opencodeGoAnthropic: lookupMock("opencodeGoAnthropic"),
    opencodeZen: lookupMock("opencodeZen"),
    embedding: () => createMockEmbeddingModel(),
    rerank: () => async () => [],
  };
})();
