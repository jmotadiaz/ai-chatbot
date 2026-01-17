import { simulateReadableStream } from "ai";
import { LanguageModelV3, EmbeddingModelV3, LanguageModelV3StreamPart, LanguageModelV3GenerateResult } from "@ai-sdk/provider";

export type LanguageModelV2 = LanguageModelV3;

export type EmbeddingModelV2 = EmbeddingModelV3;

export class MockLanguageModelV3 implements LanguageModelV2 {
  readonly specificationVersion = "v3";

  private _supportedUrls: () => LanguageModelV2["supportedUrls"];

  readonly provider: LanguageModelV2["provider"];
  readonly modelId: LanguageModelV2["modelId"];

  doGenerate: LanguageModelV2["doGenerate"];
  doStream: LanguageModelV2["doStream"];

  doGenerateCalls: Parameters<LanguageModelV2["doGenerate"]>[0][] = [];
  doStreamCalls: Parameters<LanguageModelV2["doStream"]>[0][] = [];

  constructor({
    provider = "mock-provider",
    modelId = "mock-model-id",
    supportedUrls = {},
    doGenerate = notImplemented,
    doStream = notImplemented,
  }: {
    provider?: LanguageModelV2["provider"];
    modelId?: LanguageModelV2["modelId"];
    supportedUrls?:
      | LanguageModelV2["supportedUrls"]
      | (() => LanguageModelV2["supportedUrls"]);
    doGenerate?:
      | LanguageModelV2["doGenerate"]
      | Awaited<ReturnType<LanguageModelV2["doGenerate"]>>
      | Awaited<ReturnType<LanguageModelV2["doGenerate"]>>[];
    doStream?:
      | LanguageModelV2["doStream"]
      | Awaited<ReturnType<LanguageModelV2["doStream"]>>
      | Awaited<ReturnType<LanguageModelV2["doStream"]>>[];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.doGenerate = async (options) => {
      this.doGenerateCalls.push(options);

      if (typeof doGenerate === "function") {
        return doGenerate(options);
      } else if (Array.isArray(doGenerate)) {
        return doGenerate[this.doGenerateCalls.length];
      } else {
        return doGenerate;
      }
    };
    this.doStream = async (options) => {
      this.doStreamCalls.push(options);

      if (typeof doStream === "function") {
        return doStream(options);
      } else if (Array.isArray(doStream)) {
        return doStream[this.doStreamCalls.length];
      } else {
        return doStream;
      }
    };
    this._supportedUrls =
      typeof supportedUrls === "function"
        ? supportedUrls
        : async () => supportedUrls;
  }

  get supportedUrls() {
    return this._supportedUrls();
  }
}

export class MockEmbeddingModelV3 implements EmbeddingModelV2 {
  readonly specificationVersion = "v3";

  readonly provider: EmbeddingModelV2["provider"];
  readonly modelId: EmbeddingModelV2["modelId"];
  readonly maxEmbeddingsPerCall: EmbeddingModelV2["maxEmbeddingsPerCall"];
  readonly supportsParallelCalls: EmbeddingModelV2["supportsParallelCalls"];

  doEmbed: EmbeddingModelV2["doEmbed"];

  constructor({
    provider = "mock-provider",
    modelId = "mock-model-id",
    maxEmbeddingsPerCall = 1,
    supportsParallelCalls = false,
    doEmbed = notImplemented,
  }: {
    provider?: EmbeddingModelV2["provider"];
    modelId?: EmbeddingModelV2["modelId"];
    maxEmbeddingsPerCall?:
      | EmbeddingModelV2["maxEmbeddingsPerCall"]
      | null;
    supportsParallelCalls?: EmbeddingModelV2["supportsParallelCalls"];
    doEmbed?: EmbeddingModelV2["doEmbed"];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.maxEmbeddingsPerCall = maxEmbeddingsPerCall ?? undefined;
    this.supportsParallelCalls = supportsParallelCalls;
    this.doEmbed = doEmbed;
  }
}

function notImplemented(): never {
  throw new Error("Not implemented");
}

export const createMockModel = (modelId: string): LanguageModelV2 => {
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
          // topP/topK removed from configuration
          { type: "text-end", id: "text-1" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            logprobs: undefined,
            usage: {
              inputTokens: { total: 3, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
              outputTokens: { total: 10, text: undefined, reasoning: undefined },
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
            inputTokens: { total: 10, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
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
          inputTokens: { total: 10, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
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

export const createMockEmbeddingModel = (): EmbeddingModelV2 => {
  return new MockEmbeddingModelV3({
    doEmbed: async () => ({
      embeddings: [[0.1, 0.2, 0.3]],
      usage: { tokens: 10 },
      warnings: [],
    }),
  });
};
