import { groq } from "@ai-sdk/groq";
import type { EmbeddingModel, LanguageModel } from "ai";
import { gateway } from "ai";
import { createXai } from "@ai-sdk/xai";
import { openai } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import { deepseek } from "@ai-sdk/deepseek";
import { perplexity } from "@ai-sdk/perplexity";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  createMockEmbeddingModel,
  createMockModel,
} from "@/lib/ai/models/mocks";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export const google = createGoogleGenerativeAI();
export const xai = createXai();

export type LanguageModelV2 = Exclude<LanguageModel, string>;

export type EmbeddingModelV2<T = string> = Exclude<EmbeddingModel<T>, string>;

export interface Providers {
  anthropic: (modelId: string) => LanguageModelV2;
  openai: (modelId: string) => LanguageModelV2;
  google: (modelId: string) => LanguageModelV2;
  xai: (modelId: string) => LanguageModelV2;
  groq: (modelId: string) => LanguageModelV2;
  openrouter: (modelId: string) => LanguageModelV2;
  deepseek: (modelId: string) => LanguageModelV2;
  perplexity: (modelId: string) => LanguageModelV2;
  gateway: (modelId: string) => LanguageModelV2;
  embedding: () => EmbeddingModelV2;
}

export interface ProvidersFactory {
  (): Providers;
}

export const providers: Providers = process.env.USE_MOCK_PROVIDERS
  ? {
      anthropic: (modelId: string) => createMockModel(modelId),
      openai: (modelId: string) => createMockModel(modelId),
      google: (modelId: string) => createMockModel(modelId),
      xai: (modelId: string) => createMockModel(modelId),
      groq: (modelId: string) => createMockModel(modelId),
      openrouter: (modelId: string) => createMockModel(modelId),
      deepseek: (modelId: string) => createMockModel(modelId),
      perplexity: (modelId: string) => createMockModel(modelId),
      gateway: (modelId: string) => createMockModel(modelId),
      embedding: () => createMockEmbeddingModel(),
    }
  : {
      anthropic: (modelId: string) => anthropic(modelId),
      openai: (modelId: string) => openai(modelId),
      google: (modelId: string) => google(modelId),
      xai: (modelId: string) => xai(modelId),
      groq: (modelId: string) => groq(modelId),
      openrouter: (modelId: string) => openrouter.chat(modelId),
      deepseek: (modelId: string) => deepseek(modelId),
      perplexity: (modelId: string) => perplexity(modelId),
      gateway: (modelId: string) => gateway(modelId),
      embedding: () => google.textEmbeddingModel("gemini-embedding-001"),
    };
