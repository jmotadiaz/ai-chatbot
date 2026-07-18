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
import { createDeepInfra } from "@ai-sdk/deepinfra";
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
      apiKey: process.env.OPENCODE_ZEN_API_KEY,
      baseURL: "https://opencode.ai/zen/go/v1",
    });
  }
  return _opencodeGo;
}

const openrouter = createOpenRouter();
const deepinfra = createDeepInfra();

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
      deepinfra: (modelId: string) => deepinfra(modelId),
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

  // Test mode: look up the model in the MOCK_MODELS registry. The registry
  // contains entries for models with specialized behavior (e.g. Claude
  // Sonnet 4.6). Models without specialized entries fall back to the
  // content-driven createMockModel mock.
  const lookupMock = (modelId: string) => {
    if (modelId in MOCK_MODELS) {
      return MOCK_MODELS[modelId].languageModel;
    }
    return createMockModel(modelId);
  };

  return {
    anthropic: lookupMock,
    openai: lookupMock,
    google: lookupMock,
    xai: lookupMock,
    groq: lookupMock,
    deepseek: lookupMock,
    perplexity: lookupMock,
    gateway: lookupMock,
    openrouter: lookupMock,
    deepinfra: lookupMock,
    lmstudio: lookupMock,
    opencodeGo: lookupMock,
    embedding: () => createMockEmbeddingModel(),
    rerank: () => async () => [],
  };
})();
