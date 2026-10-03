import { simulateReadableStream } from "ai";
import { MockLanguageModelV3, MockEmbeddingModelV3, MockSpeechModelV3 } from "ai/test";
import {
  LanguageModelV3,
  EmbeddingModelV3,
  LanguageModelV3StreamPart,
  LanguageModelV3GenerateResult,
  SpeechModelV3,
} from "@ai-sdk/provider";

export const createMockModel = (modelId: string): LanguageModelV3 => {
  return new MockLanguageModelV3({
    modelId,
    doStream: async ({ temperature }) => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "text-1" },
          { type: "text-delta", id: "text-1", delta: "Hello" },
          { type: "text-delta", id: "text-1", delta: ", I'm " },
          { type: "text-delta", id: "text-1", delta: `${modelId}, ` },
          {
            type: "text-delta",
            id: "text-1",
            delta: `Temperature: ${temperature}, `,
          },
          { type: "text-end", id: "text-1" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            logprobs: undefined,
            usage: {
              inputTokens: {
                total: 3,
                noCache: undefined,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: 10,
                text: undefined,
                reasoning: undefined,
              },
            },
          },
        ] as LanguageModelV3StreamPart[],
      }),
      rawCall: { rawPrompt: null, rawSettings: {} },
    }),
    doGenerate: async () => ({
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: {
          total: 10,
          noCache: undefined,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 20, text: undefined, reasoning: undefined },
      },
      content: [
        {
          type: "text",
          text: `Mock response from ${modelId}`,
        },
      ],
      warnings: [],
    } as LanguageModelV3GenerateResult),
  });
};

export const createMockEmbeddingModel = (): EmbeddingModelV3 => {
  return new MockEmbeddingModelV3({
    doEmbed: async () => ({
      embeddings: [[0.1, 0.2, 0.3]],
      usage: { tokens: 10 },
      warnings: [],
    }),
  });
};

export const createMockSpeechModel = (): SpeechModelV3 => {
  return new MockSpeechModelV3({
    doGenerate: async () => ({
      audio: "",
      warnings: [],
      response: { timestamp: new Date(), modelId: "mock-speech-model" },
    }),
  });
};
