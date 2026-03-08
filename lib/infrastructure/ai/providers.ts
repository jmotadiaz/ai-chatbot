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
import type { Providers } from "@/lib/features/foundation-model/types";
import { createMockEmbeddingModel, createMockModel } from "@/tests/mocks/ai";

const lmstudio = createOpenAICompatible({
  name: "lmstudio",
  baseURL: "http://localhost:1234/v1",
});

export const google = createGoogleGenerativeAI();
export const xai = createXai();

export const providers: Providers =
  process.env.NEXT_PUBLIC_ENV === "test"
    ? {
        anthropic: (modelId: string) => createMockModel(modelId),
        openai: (modelId: string) => createMockModel(modelId),
        google: (modelId: string) => createMockModel(modelId),
        xai: (modelId: string) => createMockModel(modelId),
        groq: (modelId: string) => createMockModel(modelId),
        deepseek: (modelId: string) => createMockModel(modelId),
        perplexity: (modelId: string) => createMockModel(modelId),
        gateway: (modelId: string) => createMockModel(modelId),
        lmstudio: (modelId: string) => createMockModel(modelId),
        embedding: () => createMockEmbeddingModel(),
        rerank: () => () => Promise.resolve([]),
      }
    : {
        anthropic: (modelId: string) => anthropic(modelId),
        openai: (modelId: string) => openai(modelId),
        google: (modelId: string) => google(modelId),
        xai: (modelId: string) => xai(modelId),
        groq: (modelId: string) => groq(modelId),
        deepseek: (modelId: string) => deepseek(modelId),
        perplexity: (modelId: string) => perplexity(modelId),
        gateway: (modelId: string) => gateway(modelId),
        lmstudio: (modelId: string) => lmstudio(modelId),
        embedding: () => google.embeddingModel("gemini-embedding-001"),
        rerank: () => async (args) => {
          const { ranking } = await rerank({
            ...args,
            model: cohere.rerankingModel("rerank-v4.0-pro"),
          });

          return ranking;
        },
      };
