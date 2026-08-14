import { groq } from "@ai-sdk/groq";
import { gateway, rerank } from "ai";
import { createXai } from "@ai-sdk/xai";
import { openai } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import { deepseek } from "@ai-sdk/deepseek";
import { perplexity } from "@ai-sdk/perplexity";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { cohere } from "@ai-sdk/cohere";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { MODEL_CATALOG } from "models";
import { config } from "config";
import type { Providers } from "@/lib/features/foundation-model/types";
import { createMockEmbeddingModel, createMockModel } from "@/tests/mocks/ai";
import { MOCK_MODELS } from "@/tests/mocks/ai/registry";
import { isTestMode } from "@/lib/infrastructure/env";

const lmstudio = createOpenAICompatible({
  name: "lmstudio",
  baseURL: "http://localhost:1234/v1",
});

let _opencodeGo: ReturnType<typeof createOpenAICompatible> | null = null;

function getOpenCodeGo() {
  if (!_opencodeGo) {
    _opencodeGo = createOpenAICompatible({
      name: "opencode-zen-go",
      apiKey: config.opencodeZenApiKey(),
      baseURL: "https://opencode.ai/zen/go/v1",
    });
  }
  return _opencodeGo;
}

const openrouter = createOpenRouter();

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

export const google = createGoogleGenerativeAI();
export const xai = createXai();

export const providers: Providers = (() => {
  if (!isTestMode()) {
    return {
      anthropic: (modelId: string) => anthropic(modelId),
      openai: (modelId: string) => openai(modelId),
      google: (modelId: string) => google(modelId),
      xai: (modelId: string) => xai(modelId),
      groq: (modelId: string) => groq(modelId),
      deepseek: (modelId: string) => deepseek(modelId),
      perplexity: (modelId: string) => perplexity(modelId),
      gateway: (modelId: string) => gateway(modelId),
      openrouter: (modelId: string) => openrouter(modelId),
      deepinfra: (modelId: string) => getDeepInfra()(modelId),
      lmstudio: (modelId: string) => lmstudio(modelId),
      opencodeGo: (modelId: string) => getOpenCodeGo()(modelId),
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
    anthropic: lookupMock("anthropic"),
    openai: lookupMock("openai"),
    google: lookupMock("google"),
    xai: lookupMock("xai"),
    groq: lookupMock("groq"),
    deepseek: lookupMock("deepseek"),
    perplexity: lookupMock("perplexity"),
    gateway: lookupMock("gateway"),
    openrouter: lookupMock("openrouter"),
    deepinfra: lookupMock("deepinfra"),
    lmstudio: lookupMock("lmstudio"),
    opencodeGo: lookupMock("opencodeGo"),
    embedding: () => createMockEmbeddingModel(),
    rerank: () => async () => [],
  };
})();
