import { simulateReadableStream } from "ai";
import { MockLanguageModelV3, MockEmbeddingModelV3 } from "ai/test";
import {
  LanguageModelV3,
  EmbeddingModelV3,
  LanguageModelV3StreamPart,
  LanguageModelV3GenerateResult,
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
    doGenerate: async ({ prompt }) => {
      // Check for system prompt indicating tools decision
      const isToolsDecision = prompt.some(
        (p) =>
          p.role === "system" &&
          typeof p.content === "string" &&
          p.content.includes(
            "Determine if a user's request necessitates the use of the 'web search' tool"
          )
      );

      if (isToolsDecision) {
        return {
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
              text: `{ "tools": [] }`,
            },
          ],
          warnings: [],
        } as LanguageModelV3GenerateResult;
      }

      const lastPrompt = prompt[prompt.length - 1];
      const lastMessageContent =
        lastPrompt.role === "user"
          ? lastPrompt.content
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join(" ")
          : "";

      const categoryMatch = lastMessageContent.match(/category=(\w+)/);
      const complexityMatch = lastMessageContent.match(/complexity=(\w+)/);

      const category = categoryMatch ? categoryMatch[1] : "other";
      const complexity = complexityMatch ? complexityMatch[1] : "simple";

      return {
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
            text: `{ "category": "${category}", "complexity": "${complexity}" }`,
          },
        ],
        warnings: [],
      } as LanguageModelV3GenerateResult;
    },
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
